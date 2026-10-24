import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

const schema = z.object({ status: z.enum(['APPROVED', 'REJECTED', 'PAID', 'CANCELLED']), approvedAmount: z.coerce.number().nonnegative().optional(), reviewNote: z.string().max(1000).optional() })
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth(); if (error) return error
  if (!['SUPER_ADMIN','COMPANY_ADMIN','HR_MANAGER','PAYROLL_OFFICER'].includes(ctx.role)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'Invalid review action.' }, { status: 422 })
  const { id } = await params
  const existing = await prisma.expenseClaim.findFirst({ where: { id, companyId: ctx.companyId } })
  if (!existing) return NextResponse.json({ error: 'Expense claim not found.' }, { status: 404 })
  const claim = await prisma.expenseClaim.update({ where: { id }, data: {
    status: parsed.data.status, approvedAmount: parsed.data.approvedAmount ?? (parsed.data.status === 'APPROVED' ? existing.amount : undefined),
    reviewNote: parsed.data.reviewNote, reviewedBy: ctx.userId, reviewedAt: new Date(), paidAt: parsed.data.status === 'PAID' ? new Date() : undefined,
  } })
  logAudit(ctx, 'UPDATE', 'ExpenseClaim', id, { description: `${parsed.data.status} expense claim` }).catch(() => {})
  return NextResponse.json({ claim })
}
