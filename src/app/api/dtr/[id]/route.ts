import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { syncAutoOvertimeRequest } from '@/lib/overtime-requests'
import {
  computeHours,
  computeLateAndUndertime,
  getCompanyNightDiffWindow,
  plannedShiftMinutes,
  resolveShiftForDtr,
} from '@/lib/timesheet/compute'
import { z } from 'zod'

const patchSchema = z.object({
  timeIn: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional().nullable(),
  timeOut: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional().nullable(),
  breakIn: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional().nullable(),
  breakOut: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional().nullable(),
  remarks: z.string().optional().nullable(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })

  const [record, company] = await Promise.all([
    prisma.dTRRecord.findFirst({
      where: { id, employee: { companyId } },
      include: {
        employee: {
          select: {
            workScheduleId: true,
            workSchedule: { select: { timeIn: true, timeOut: true, breakMinutes: true } },
          },
        },
      },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultBreakMinutes: true },
    }),
  ])
  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const { timeIn, timeOut, breakIn, breakOut, remarks } = parsed.data

  // Apply patch on top of existing values so a single-field PATCH still
  // recomputes against the correct full picture.
  const newTimeIn = timeIn ? new Date(timeIn) : record.timeIn
  const newTimeOut = timeOut !== undefined ? (timeOut ? new Date(timeOut) : null) : record.timeOut
  const newBreakIn = breakIn !== undefined ? (breakIn ? new Date(breakIn) : null) : record.breakIn
  const newBreakOut = breakOut !== undefined ? (breakOut ? new Date(breakOut) : null) : record.breakOut

  // Resolve the right shift (multi-shift safe — picks closest to actual timeIn).
  // This is the critical fix vs. the old behavior that only consulted
  // record.employee.workSchedule and ignored EmployeeShiftAssignment.
  const resolved = await resolveShiftForDtr({
    employeeId: record.employeeId,
    date: record.date,
    actualTimeIn: newTimeIn ?? null,
    employee: {
      workScheduleId: record.employee.workScheduleId,
      workSchedule: record.employee.workSchedule,
    },
    defaultBreakMinutes: company?.defaultBreakMinutes ?? 60,
  })

  const plannedRegularMinutes = plannedShiftMinutes(resolved.scheduleTimeIn, resolved.scheduleTimeOut)
  const ndWindow = await getCompanyNightDiffWindow(companyId)

  let computed: ReturnType<typeof computeHours> | null = null
  let lateUt: ReturnType<typeof computeLateAndUndertime> | null = null
  if (newTimeIn && newTimeOut) {
    computed = computeHours(newTimeIn, newTimeOut, newBreakIn, newBreakOut, {
      plannedRegularMinutes,
      allowedBreakMinutes: resolved.allowedBreakMinutes,
      nightDiffStartMins: ndWindow.startMins,
      nightDiffEndMins: ndWindow.endMins,
    })
    lateUt = computeLateAndUndertime(newTimeIn, newTimeOut, resolved.scheduleTimeIn, resolved.scheduleTimeOut)
  }

  const updated = await prisma.dTRRecord.update({
    where: { id },
    data: {
      ...(newTimeIn ? { timeIn: newTimeIn } : {}),
      timeOut: newTimeOut,
      breakIn: newBreakIn,
      breakOut: newBreakOut,
      ...(computed
        ? {
            regularHours: computed.regularHours,
            overtimeHours: computed.overtimeHours,
            nightDiffHours: computed.nightDiffHours,
          }
        : {}),
      ...(lateUt
        ? {
            lateMinutes: lateUt.lateMinutes,
            undertimeMinutes: lateUt.undertimeMinutes,
          }
        : {}),
      ...(remarks !== undefined ? { remarks } : {}),
    },
  })

  await syncAutoOvertimeRequest({
    companyId,
    employeeId: record.employeeId,
    date: updated.date,
    timeIn: updated.timeIn,
    timeOut: updated.timeOut,
    overtimeHours: Number(updated.overtimeHours ?? 0),
  })

  // Strip clockInPhoto — large base64 payload not needed by admin clients
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { clockInPhoto: _photo, ...safeRecord } = updated
  return NextResponse.json({ record: safeRecord })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const record = await prisma.dTRRecord.findFirst({
    where: { id, employee: { companyId } },
  })
  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

  await prisma.dTRRecord.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
