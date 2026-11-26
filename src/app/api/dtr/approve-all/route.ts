import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { isOvertimeEnabledForCompany, approveAutoOtForRange, approveAutoOtByIds } from '@/lib/overtime-requests'

const schema = z.object({
  weekStart: z.string().min(1),
  weekEnd: z.string().min(1),
  approveOvertime: z.boolean().optional(),
  recordIds: z.array(z.string().min(1)).min(1).max(5000).optional(),
  // Per-timesheet OT picker — see weekly-approve route for semantics.
  overtimeRequestIds: z.array(z.string()).optional(),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  if (!await ctxHasPermission({...ctx,companyId},'dtr:approve')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { weekStart, weekEnd, approveOvertime, overtimeRequestIds, recordIds } = parsed.data
  const start = new Date(weekStart)
  const end = new Date(weekEnd)
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>end)return NextResponse.json({error:'Invalid date range.'},{status:422})
  const endPlus = new Date(end)
  endPlus.setDate(endPlus.getDate() + 1)

  // Get all employee IDs for this company
  const employees = await prisma.employee.findMany({
    where: { companyId, isActive: true },
    select: { id: true },
  })
  const employeeIds = employees.map(e => e.id)

  const where = {
    ...(recordIds ? { id: { in: recordIds } } : {}),
    employeeId: { in: employeeIds },
    date: { gte: start, lt: endPlus },
    timeIn: { not: null }, timeOut: { not: null }, employee: { trackTime: true },
    approvedBy: null,
    OR: [{ remarks: null }, { remarks: { not: 'REJECTED' } }],
  }
  const selected = recordIds ? await prisma.dTRRecord.findMany({
    where, select: { employeeId: true, date: true },
  }) : null
  const result = await prisma.dTRRecord.updateMany({ where, data: { approvedBy: ctx.userId } })
  let allowedOtIds = overtimeRequestIds
  if (selected && overtimeRequestIds !== undefined) {
    allowedOtIds = selected.length ? (await prisma.overtimeRequest.findMany({
      where: { companyId, id: { in: overtimeRequestIds }, OR: selected.map(r => ({ employeeId: r.employeeId, date: r.date })) },
      select: { id: true },
    })).map(r => r.id) : []
  }

  let otApproved = 0
  if (await isOvertimeEnabledForCompany(companyId)) {
    if (overtimeRequestIds !== undefined) {
      otApproved = await approveAutoOtByIds({
        companyId,
        ids: allowedOtIds ?? [],
        dateFrom:start,dateTo:end,
        approvedById: ctx.userId,
      })
    } else if (approveOvertime && !recordIds) {
      otApproved = await approveAutoOtForRange({
        companyId,
        dateFrom: start,
        dateTo: end,
        approvedById: ctx.userId,
      })
    }
  }

  return NextResponse.json({ updated: result.count, otApproved })
}
