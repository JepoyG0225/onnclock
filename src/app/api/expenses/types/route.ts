import { NextRequest, NextResponse } from 'next/server'
import { expenseAccess } from '@/lib/expenses/access'
import { prisma } from '@/lib/prisma'
import { canManageExpenseTypes, companyExpenseTypes, expenseTypesSchema } from '@/lib/expenses/policy'
import { logAudit } from '@/lib/audit'

export async function PUT(req: NextRequest) {
  const { ctx, error } = await expenseAccess()
  if (error || !ctx) return error!
  if (!canManageExpenseTypes(ctx.role)) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })
  const parsed = expenseTypesSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 })
  const changed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM companies WHERE id = ${ctx.companyId} FOR UPDATE`
    const company = await tx.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { expenseClaimTypes: true } })
    const current = companyExpenseTypes(company.expenseClaimTypes)
    if (JSON.stringify(current) !== JSON.stringify(parsed.data.previous)) return false
    await tx.company.update({ where: { id: ctx.companyId }, data: { expenseClaimTypes: parsed.data.types } })
    return true
  })
  if (!changed) return NextResponse.json({ error: 'Expense types changed. Close this window, refresh, and try again.' }, { status: 409 })
  await logAudit(ctx, 'UPDATE', 'Company', ctx.companyId, { description: 'Updated expense claim types', oldValues: { types: parsed.data.previous }, newValues: { types: parsed.data.types } }).catch(() => {})
  return NextResponse.json({ types: parsed.data.types })
}
