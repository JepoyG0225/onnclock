import { publicExpense, storedItems } from '@/lib/expenses/items'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { expenseAccess } from '@/lib/expenses/access'
import { companyExpenseTypes, canManageExpenseTypes, createClaimSchema, csvCell, expenseStatuses, settlementAmount } from '@/lib/expenses/policy'

export async function GET(req: NextRequest) {
  const { ctx, error, employeeId, canReadAll, canApprove } = await expenseAccess()
  if (error || !ctx) return error!
  const q = req.nextUrl.searchParams
  const mine = q.get('scope') === 'mine' || !canReadAll
  const status = q.get('status') || ''
  if (status && !expenseStatuses.includes(status as typeof expenseStatuses[number])) return NextResponse.json({ error: 'Invalid status.' }, { status: 422 })
  const where: Prisma.ExpenseClaimWhereInput = {
    companyId: ctx.companyId,
    ...(mine ? { employeeId: employeeId ?? '__none__' } : { OR: [{ status: { not: 'DRAFT' } }, { employeeId: employeeId ?? '__none__' }] }),
    ...(status ? { status: status as typeof expenseStatuses[number] } : {}),
  }
  const search = (q.get('q') || '').trim().slice(0, 100)
  const and: Prisma.ExpenseClaimWhereInput[] = []
  if (search) and.push({ OR: [
    ...['description', 'category', 'id'].map(key => ({ [key]: { contains: search, mode: 'insensitive' as const } })),
    { employee: { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }, { employeeNo: { contains: search, mode: 'insensitive' } }] } },
  ] })
  if (q.get('from') && q.get('to') && q.get('from')! > q.get('to')!) return NextResponse.json({ error: 'From date must not be after To date.' }, { status: 422 })
  for (const [key, op] of [['from', 'gte'], ['to', 'lte']] as const) {
    const value = q.get(key)
    if (value) {
      const d = new Date(`${value}T00:00:00Z`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) return NextResponse.json({ error: 'Invalid date filter.' }, { status: 422 })
      and.push({ expenseDate: { [op]: d } })
    }
  }
  where.AND = and
  const page = Math.max(1, Math.min(100000, Math.floor(Number(q.get('page')) || 1)))
  const exporting = q.get('export') === 'csv'
  const [total, claims, groups, company] = await Promise.all([
    prisma.expenseClaim.count({ where }),
    prisma.expenseClaim.findMany({ where, include: { employee: { select: { firstName: true, lastName: true, employeeNo: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: exporting ? 0 : (page - 1) * 25, take: exporting ? 10001 : 25 }),
    prisma.expenseClaim.groupBy({ by: ['status', 'currency'], where, _count: true, _sum: { amount: true, approvedAmount: true, settledAmount: true } }),
    prisma.company.findUnique({ where: { id: ctx.companyId }, select: { payrollCurrency: true, expenseClaimTypes: true } }),
  ])
  if (exporting) {
    if (claims.length > 10000) return NextResponse.json({ error: 'Narrow the date range to export up to 10,000 claims.' }, { status: 422 })
    const rows = [['Claim ID','Employee','Employee number','Category','Expense date','Currency','Claimed','Approved','Advance','Settlement due (+ reimbursement / - return)','Status','Method','Reference','Payment date','Item breakdown'], ...claims.map(c => [c.id, `${c.employee.firstName} ${c.employee.lastName}`, c.employee.employeeNo, c.category, c.expenseDate.toISOString().slice(0,10), c.currency, c.amount, c.approvedAmount, c.cashAdvanceAmount, c.approvedAmount == null ? '' : settlementAmount(Number(c.approvedAmount), c.isLiquidation, Number(c.cashAdvanceAmount)), c.status, c.paymentMethod, c.paymentReference, c.paidAt?.toISOString().slice(0,10), storedItems(c.items).map((item, index) => `${index + 1}. ${item.name}: ${item.description} | ${c.currency} ${item.amount.toFixed(2)}`).join('\n')])]
    return new NextResponse('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="expense-claims.csv"', 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ claims: claims.map(c => ({ ...publicExpense(c), isOwner: c.employeeId === employeeId })), total, page, pageSize: 25, groups, expenseTypes: companyExpenseTypes(company?.expenseClaimTypes), canManageTypes: canManageExpenseTypes(ctx.role), canApprove, canReadAll, canSubmit: Boolean(employeeId), currency: company?.payrollCurrency || 'PHP' })
}

export async function POST(req: NextRequest) {
  const { ctx, error, employeeId } = await expenseAccess()
  if (error || !ctx) return error!
  if (!employeeId) return NextResponse.json({ error: 'Link an active employee profile before creating a claim.' }, { status: 403 })
  const parsed = createClaimSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 })
  const { requestKey, fields } = parsed.data
  const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { payrollCurrency: true, expenseClaimTypes: true } })
  if (!companyExpenseTypes(company.expenseClaimTypes).includes(fields.category)) return NextResponse.json({ error: 'Select a current expense type. Refresh the page to load the latest types.' }, { status: 422 })
  const data = { ...fields, expenseDate: new Date(`${fields.expenseDate}T00:00:00Z`), cashAdvanceAmount: fields.isLiquidation ? fields.cashAdvanceAmount : null, companyId: ctx.companyId, employeeId, requestKey, currency: company.payrollCurrency || 'PHP', status: 'DRAFT' as const, history: [{ action: 'CREATED', at: new Date().toISOString(), actor: ctx.email }] }
  try {
    const claim = await prisma.expenseClaim.create({ data })
    return NextResponse.json({ claim: publicExpense(claim) }, { status: 201 })
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e
    const claim = await prisma.expenseClaim.findFirst({ where: { requestKey, companyId: ctx.companyId, employeeId } })
    if (!claim) return NextResponse.json({ error: 'Request key already used.' }, { status: 409 })
    return NextResponse.json({ claim: publicExpense(claim) })
  }
}
