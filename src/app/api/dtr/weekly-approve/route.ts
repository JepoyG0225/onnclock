import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { isOvertimeEnabledForCompany, approveAutoOtForRange } from '@/lib/overtime-requests'

const schema = z.object({
  employeeId: z.string().min(1),
  weekStart: z.string().min(1), // YYYY-MM-DD
  weekEnd: z.string().min(1),   // YYYY-MM-DD
  action: z.enum(['APPROVED', 'REJECTED']),
  approveOvertime: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employeeId, weekStart, weekEnd, action, approveOvertime } = parsed.data

  const start = new Date(weekStart)
  const end = new Date(weekEnd)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Invalid week range' }, { status: 400 })
  }
  const endPlus = new Date(end)
  endPlus.setDate(endPlus.getDate() + 1)

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: { id: true },
  })
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }

  const pendingWhere = {
    employeeId: employee.id,
    date: { gte: start, lt: endPlus },
    approvedBy: null,
    OR: [{ remarks: null }, { remarks: { not: 'REJECTED' } }],
  }

  const update =
    action === 'APPROVED'
      ? { approvedBy: ctx.userId as string }
      : { approvedBy: null, remarks: 'REJECTED' }

  const result = await prisma.dTRRecord.updateMany({
    where: pendingWhere,
    data: update,
  })

  let otApproved = 0
  if (action === 'APPROVED' && approveOvertime && await isOvertimeEnabledForCompany(companyId)) {
    otApproved = await approveAutoOtForRange({
      companyId,
      employeeId: employee.id,
      dateFrom: start,
      dateTo: end,
      approvedById: ctx.userId,
    })
  }

  return NextResponse.json({ updated: result.count, otApproved })
}
