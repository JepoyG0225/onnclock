import { hasExpenseReceipts, mergeExpenseItems, publicExpense, storedItems } from '@/lib/expenses/items'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { expenseAccess } from '@/lib/expenses/access'
import { companyExpenseTypes, claimActionSchema, expenseActionError, settlementAmount } from '@/lib/expenses/policy'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { logAudit } from '@/lib/audit'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error, employeeId, canApprove } = await expenseAccess()
  if (error || !ctx) return error!
  const parsed = claimActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 })
  const { id } = await params
  const c = await prisma.expenseClaim.findFirst({ where: { id, companyId: ctx.companyId }, include: { employee: { select: { userId: true } } } })
  if (!c) return NextResponse.json({ error: 'Claim not found.' }, { status: 404 })
  const a = parsed.data
  if (c.updatedAt.toISOString() !== a.updatedAt) return NextResponse.json({ error: 'This claim changed. Refresh and review its latest status.' }, { status: 409 })
  const violation = expenseActionError(a.action, { status: c.status, amount: Number(c.amount), hasReceipt: hasExpenseReceipts(c) }, c.employeeId === employeeId, canApprove, a.action === 'APPROVE' ? a.approvedAmount : undefined)
  if (violation) return NextResponse.json({ error: violation }, { status: 403 })
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
  if (a.action === 'SUBMIT' && c.expenseDate.toISOString().slice(0,10) > today) return NextResponse.json({ error: 'Expense date cannot be in the future.' }, { status: 422 })
  if (a.action === 'PAY' && c.approvedAmount == null) return NextResponse.json({ error: 'This legacy claim has no approved amount. Resolve its approval amount before settlement.' }, { status: 422 })
  if (a.action === 'PAY' && (a.paymentDate > today || a.paymentDate < ((c.reviewedAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(c.reviewedAt) : null) ?? c.expenseDate.toISOString().slice(0,10)))) return NextResponse.json({ error: 'Payment date must be between approval and today.' }, { status: 422 })
  if (a.action === 'APPROVE' && a.approvedAmount < Number(c.amount) && a.note.length < 3) return NextResponse.json({ error: 'Explain the reduced approval amount.' }, { status: 422 })
  if (a.action === 'EDIT' && a.fields.category !== c.category) {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { expenseClaimTypes: true } })
    if (!companyExpenseTypes(company.expenseClaimTypes).includes(a.fields.category)) return NextResponse.json({ error: 'Select a current expense type.' }, { status: 422 })
  }
  if (a.action === 'EDIT' && storedItems(c.items).length && !a.fields.items) return NextResponse.json({ error: 'Include all expense items when editing this claim.' }, { status: 422 })
  const data: Prisma.ExpenseClaimUpdateManyMutationInput = {}
  if (a.action === 'EDIT') Object.assign(data, a.fields, { ...(a.fields.items ? { items: mergeExpenseItems(a.fields.items, c.items) } : {}), expenseDate: new Date(`${a.fields.expenseDate}T00:00:00Z`), cashAdvanceAmount: a.fields.isLiquidation ? a.fields.cashAdvanceAmount : null, status: 'DRAFT', reviewNote: null, reviewedBy: null, reviewedAt: null, approvedAmount: null })
  if (a.action === 'SUBMIT') data.status = 'PENDING'
  if (a.action === 'CANCEL') data.status = 'CANCELLED'
  if (a.action === 'APPROVE' || a.action === 'REJECT') Object.assign(data, { status: a.action === 'APPROVE' ? 'APPROVED' : 'REJECTED', approvedAmount: a.action === 'APPROVE' ? a.approvedAmount : null, reviewNote: a.note, reviewedBy: ctx.userId, reviewedAt: new Date() })
  if (a.action === 'PAY') Object.assign(data, { status: 'PAID', paidAt: new Date(`${a.paymentDate}T00:00:00Z`), paymentMethod: a.paymentMethod, paymentReference: a.paymentReference, settledAmount: settlementAmount(Number(c.approvedAmount), c.isLiquidation, Number(c.cashAdvanceAmount)) })
  data.history = [...(Array.isArray(c.history) ? c.history : []), { action: a.action, at: new Date().toISOString(), actor: ctx.email, ...(a.action === 'APPROVE' ? { amount: a.approvedAmount } : {}), ...('note' in a ? { note: a.note } : {}), ...(a.action === 'PAY' ? { reference: a.paymentReference, method: a.paymentMethod } : {}) }] as Prisma.InputJsonValue
  const recipients: string[] = []
  if (a.action === 'SUBMIT') {
    const members = await prisma.userCompany.findMany({ where: { companyId: ctx.companyId, isActive: true, user: { isActive: true }, userId: { not: ctx.userId } }, select: { userId: true, role: true } })
    for (const member of members) {
      const permissions = await getEffectivePermissions(member.role, ctx.companyId, member.userId)
      if (permissions.includes('expenses:approve')) recipients.push(member.userId)
    }
  }
  const changed = await prisma.$transaction(async tx => {
    const result = await tx.expenseClaim.updateMany({ where: { id, companyId: ctx.companyId, status: c.status, updatedAt: new Date(a.updatedAt) }, data })
    if (!result.count) return false
    if (c.employee.userId && ['APPROVE', 'REJECT', 'PAY'].includes(a.action)) await tx.notification.create({ data: { companyId: ctx.companyId, userId: c.employee.userId, type: 'GENERIC', title: `Expense claim ${a.action === 'PAY' ? 'settled' : a.action === 'APPROVE' ? 'approved' : 'rejected'}`, body: `${c.category}: ${c.currency} ${c.amount}${'note' in a && a.note ? `. ${a.note}` : ''}`, link: '/portal/expenses' } })
    if (recipients.length) await tx.notification.createMany({ data: recipients.map(userId => ({ companyId: ctx.companyId, userId, type: 'GENERIC' as const, title: 'Expense claim awaiting review', body: `${c.category}: ${c.currency} ${c.amount}`, link: '/expenses' })) })
    return true
  })
  if (!changed) return NextResponse.json({ error: 'This claim changed. Refresh and review its latest status.' }, { status: 409 })
  await logAudit(ctx, 'UPDATE', 'ExpenseClaim', id, { description: `${a.action} expense claim` }).catch(() => {})
  const updated = await prisma.expenseClaim.findUniqueOrThrow({ where: { id } })
  return NextResponse.json({ success: true, claim: publicExpense(updated) })
}
