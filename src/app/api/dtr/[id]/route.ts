import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { syncAutoOvertimeRequest, applyManualOtOverride } from '@/lib/overtime-requests'
import {
  computeHours,
  computeLateAndUndertime,
  getCompanyNightDiffWindow,
  normalizeSingleShiftTimeOut,
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
  // ── Manual overrides ────────────────────────────────────────────────────
  // When provided, these win over the timestamp-derived recomputation.
  // Admins can use this to set total hours directly when timestamps are
  // unreliable (e.g. an employee worked off-clock or a different break length).
  regularHours: z.number().min(0).max(24).optional(),
  overtimeHours: z.number().min(0).max(24).optional(),
  nightDiffHours: z.number().min(0).max(24).optional(),
  lateMinutes: z.number().int().min(0).max(24 * 60).optional(),
  undertimeMinutes: z.number().int().min(0).max(24 * 60).optional(),
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
            workSchedule: { select: { timeIn: true, timeOut: true, breakMinutes: true, workHoursPerDay: true } },
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

  const {
    timeIn, timeOut, breakIn, breakOut, remarks,
    regularHours: overrideReg,
    overtimeHours: overrideOt,
    nightDiffHours: overrideNd,
    lateMinutes: overrideLate,
    undertimeMinutes: overrideUt,
  } = parsed.data
  const hasManualHours = overrideReg !== undefined || overrideOt !== undefined ||
                          overrideNd !== undefined || overrideLate !== undefined ||
                          overrideUt !== undefined

  // Apply patch on top of existing values so a single-field PATCH still
  // recomputes against the correct full picture.
  const newTimeIn = timeIn ? new Date(timeIn) : record.timeIn
  const requestedTimeOut = timeOut !== undefined ? (timeOut ? new Date(timeOut) : null) : record.timeOut
  const newTimeOut = newTimeIn && requestedTimeOut
    ? normalizeSingleShiftTimeOut(newTimeIn, requestedTimeOut)
    : requestedTimeOut
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

  const plannedRegularMinutes = resolved.plannedRegularMinutes
  const ndWindow = await getCompanyNightDiffWindow(companyId)

  let computed: ReturnType<typeof computeHours> | null = null
  let lateUt: ReturnType<typeof computeLateAndUndertime> | null = null
  if (newTimeIn && newTimeOut) {
    computed = computeHours(newTimeIn, newTimeOut, newBreakIn, newBreakOut, {
      plannedRegularMinutes,
      allowedBreakMinutes: resolved.allowedBreakMinutes,
      nightDiffStartMins: ndWindow.startMins,
      nightDiffEndMins: ndWindow.endMins,
      nightDiffIncludesBreak: ndWindow.includesBreak,
      scheduledTimeIn: resolved.scheduleTimeIn,
      scheduledTimeOut: resolved.scheduleTimeOut,
    })
    lateUt = computeLateAndUndertime(newTimeIn, newTimeOut, resolved.scheduleTimeIn, resolved.scheduleTimeOut)
  }

  // Build final hours/minutes: any per-field override wins over the
  // auto-recomputed value. This lets admins fix one number (e.g. just
  // regular hours) without having to re-derive correct timestamps.
  const finalRegular  = overrideReg  ?? computed?.regularHours
  const finalOvertime = overrideOt   ?? computed?.overtimeHours
  const finalNightDiff = overrideNd  ?? computed?.nightDiffHours
  const finalLate     = overrideLate ?? lateUt?.lateMinutes
  const finalUt       = overrideUt   ?? lateUt?.undertimeMinutes

  const updated = await prisma.dTRRecord.update({
    where: { id },
    data: {
      ...(newTimeIn ? { timeIn: newTimeIn } : {}),
      timeOut: newTimeOut,
      breakIn: newBreakIn,
      breakOut: newBreakOut,
      ...(finalRegular  !== undefined ? { regularHours: finalRegular   } : {}),
      ...(finalOvertime !== undefined ? { overtimeHours: finalOvertime } : {}),
      ...(finalNightDiff !== undefined ? { nightDiffHours: finalNightDiff } : {}),
      ...(finalLate !== undefined ? { lateMinutes: finalLate } : {}),
      ...(finalUt   !== undefined ? { undertimeMinutes: finalUt } : {}),
      // Combine user-provided remarks with manual-hours audit trail.
      ...((() => {
        const baseRemarks = remarks !== undefined ? remarks : record.remarks
        if (!hasManualHours) return remarks !== undefined ? { remarks } : {}
        const auditLine =
          `[Manual edit ${new Date().toISOString()}] hours overridden by admin`
          + (overrideReg !== undefined ? ` (reg=${overrideReg})` : '')
          + (overrideOt  !== undefined ? ` (ot=${overrideOt})`  : '')
          + (overrideNd  !== undefined ? ` (nd=${overrideNd})`  : '')
          + (overrideLate !== undefined ? ` (late=${overrideLate})` : '')
          + (overrideUt   !== undefined ? ` (ut=${overrideUt})`   : '')
        const combined = baseRemarks ? `${baseRemarks}\n${auditLine}` : auditLine
        return { remarks: combined }
      })()),
    },
  })

  if (overrideOt !== undefined) {
    // Admin explicitly set OT on the timesheet — make it authoritative
    // (APPROVED), so it sticks on the timesheet and pays. Overriding to 0
    // clears the day's auto-OT.
    await applyManualOtOverride({
      companyId,
      employeeId: record.employeeId,
      date: updated.date,
      hours: Number(finalOvertime ?? 0),
      approvedById: ctx.userId,
      timeIn: updated.timeIn,
      timeOut: updated.timeOut,
    })
  } else {
    // Time-only edit — keep the auto-detect flow (creates a PENDING request
    // for HR to approve).
    await syncAutoOvertimeRequest({
      companyId,
      employeeId: record.employeeId,
      date: updated.date,
      timeIn: updated.timeIn,
      timeOut: updated.timeOut,
      overtimeHours: Number(updated.overtimeHours ?? 0),
    })
  }

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
