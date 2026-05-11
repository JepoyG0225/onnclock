import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { isOvertimeEnabledForCompany, approveAutoOtForRange } from '@/lib/overtime-requests'

const schema = z.object({
  weekStart: z.string().min(1),
  weekEnd: z.string().min(1),
  approveOvertime: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { weekStart, weekEnd, approveOvertime } = parsed.data
  const start = new Date(weekStart)
  const end = new Date(weekEnd)
  const endPlus = new Date(end)
  endPlus.setDate(endPlus.getDate() + 1)

  // Get all employee IDs for this company
  const employees = await prisma.employee.findMany({
    where: { companyId, isActive: true },
    select: { id: true },
  })
  const employeeIds = employees.map(e => e.id)

  const result = await prisma.dTRRecord.updateMany({
    where: {
      employeeId: { in: employeeIds },
      date: { gte: start, lt: endPlus },
      approvedBy: null,
      OR: [{ remarks: null }, { remarks: { not: 'REJECTED' } }],
    },
    data: { approvedBy: ctx.userId },
  })

  let otApproved = 0
  if (approveOvertime && await isOvertimeEnabledForCompany(companyId)) {
    otApproved = await approveAutoOtForRange({
      companyId,
      dateFrom: start,
      dateTo: end,
      approvedById: ctx.userId,
    })
  }

  return NextResponse.json({ updated: result.count, otApproved })
}
