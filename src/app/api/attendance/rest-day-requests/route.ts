import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { z } from 'zod'
const roles = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN']
const selection = { id: true, date: true, timeIn: true, timeOut: true, restDayApproval: true, restDayReviewNote: true, employee: { select: { firstName: true, lastName: true, employeeNo: true, userId: true } } } as const
export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if ((!roles.includes(ctx.role) || !await ctxHasPermission(ctx, 'dtr:approve'))) return NextResponse.json({ canReview: false, requests: [] })
  const requests = await prisma.dTRRecord.findMany({ where: { employee: { companyId: ctx.companyId }, isRestDay: true, timeIn: { not: null }, restDayApproval: { in: ['PENDING', 'REJECTED'] } }, select: selection, orderBy: { timeIn: 'desc' }, take: 200 })
  return NextResponse.json({ canReview: true, requests }, { headers: { 'Cache-Control': 'private, no-store' } })
}
const schema = z.object({ id: z.string().min(1), action: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(1000).default('') }).refine(v => v.action !== 'REJECTED' || v.note.length >= 3, { message: 'Give a reason for rejecting the shift.' })
export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if ((!roles.includes(ctx.role) || !await ctxHasPermission(ctx, 'dtr:approve'))) return NextResponse.json({ error: 'Only HR managers and company administrators may review rest-day shifts.' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 })
  const { id, action, note } = parsed.data
  const record = await prisma.dTRRecord.findFirst({ where: { id, employee: { companyId: ctx.companyId }, isRestDay: true, restDayApproval: { in: ['PENDING', 'REJECTED'] } }, select: selection })
  if (!record) return NextResponse.json({ error: 'Pending rest-day request not found.' }, { status: 404 })
  if (record.employee.userId === ctx.userId) return NextResponse.json({ error: 'Another HR manager or company administrator must review your shift.' }, { status: 403 })
  const changed = await prisma.dTRRecord.updateMany({ where: { id, restDayApproval: { in: ['PENDING', 'REJECTED'] }, employee: { companyId: ctx.companyId } }, data: { restDayApproval: action, restDayReviewedBy: ctx.userId, restDayReviewedAt: new Date(), restDayReviewNote: note } })
  if (!changed.count) return NextResponse.json({ error: 'This shift was already reviewed. Refresh the list.' }, { status: 409 })
  await logAudit(ctx, action === 'APPROVED' ? 'APPROVE' : 'REJECT', 'RestDayShift', id, { description: `${action}: ${record.date.toISOString().slice(0,10)}. ${note}` })
  if (record.employee.userId) await createNotification({ companyId: ctx.companyId, userId: record.employee.userId, type: 'GENERIC', title: `Rest-day shift ${action.toLowerCase()}`, body: note || record.date.toISOString().slice(0,10), link: '/portal/clock' })
  return NextResponse.json({ success: true })
}
