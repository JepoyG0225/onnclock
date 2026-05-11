import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { syncAutoOvertimeRequest } from '@/lib/overtime-requests'
import {
  computeHours,
  computeLateAndUndertime,
  plannedShiftMinutes,
  resolveShiftForDtr,
} from '@/lib/timesheet/compute'
import { differenceInMinutes } from 'date-fns'
import { z } from 'zod'

const schema = z.object({
  employeeId: z.string().min(1),
  action: z.enum(['end-break', 'clock-out']),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const { employeeId, action } = parsed.data

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: ctx.companyId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      workScheduleId: true,
      workSchedule: { select: { timeIn: true, timeOut: true, breakMinutes: true } },
    },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const existing = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null },
    orderBy: { timeIn: 'desc' },
  })
  if (!existing) return NextResponse.json({ error: 'Employee is not currently clocked in' }, { status: 409 })

  const now = new Date()

  // ── End Break ────────────────────────────────────────────────────────────
  if (action === 'end-break') {
    if (!existing.breakIn || existing.breakOut) {
      return NextResponse.json({ error: 'Employee is not currently on break' }, { status: 409 })
    }
    const record = await prisma.dTRRecord.update({
      where: { id: existing.id },
      data: { breakOut: now },
    })
    return NextResponse.json({ record, message: `Break ended for ${employee.firstName} ${employee.lastName}` })
  }

  // ── Clock Out ────────────────────────────────────────────────────────────
  if (action === 'clock-out') {
    const effectiveBreakIn = existing.breakIn ?? null
    const effectiveBreakOut = existing.breakIn ? (existing.breakOut ?? now) : null

    const company = await prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { defaultBreakMinutes: true },
    })

    // Multi-shift safe schedule resolver — picks the assignment whose start
    // time is closest to the actual clock-in for days with multiple shifts.
    const resolved = await resolveShiftForDtr({
      employeeId: employee.id,
      date: existing.date,
      actualTimeIn: existing.timeIn!,
      employee: {
        workScheduleId: employee.workScheduleId,
        workSchedule: employee.workSchedule
          ? {
              timeIn: employee.workSchedule.timeIn ?? null,
              timeOut: employee.workSchedule.timeOut ?? null,
              breakMinutes: employee.workSchedule.breakMinutes ?? null,
            }
          : null,
      },
      defaultBreakMinutes: company?.defaultBreakMinutes ?? 60,
    })
    const plannedRegularMins = plannedShiftMinutes(resolved.scheduleTimeIn, resolved.scheduleTimeOut)

    const { regularHours, overtimeHours, nightDiffHours } = computeHours(
      existing.timeIn!,
      now,
      effectiveBreakIn,
      effectiveBreakOut,
      { plannedRegularMinutes: plannedRegularMins, allowedBreakMinutes: resolved.allowedBreakMinutes },
    )

    const { lateMinutes, undertimeMinutes } = computeLateAndUndertime(
      existing.timeIn!,
      now,
      resolved.scheduleTimeIn,
      resolved.scheduleTimeOut,
    )

    // Overbreak: extra minutes spent on break beyond the allowed window count
    // as tardiness. Cap at 12h to ignore corrupted multi-day break spans.
    const actualBreakMinutes = effectiveBreakIn && effectiveBreakOut
      ? Math.max(0, differenceInMinutes(effectiveBreakOut, effectiveBreakIn))
      : 0
    const overBreakMinutes = actualBreakMinutes > 12 * 60
      ? 0
      : Math.max(0, actualBreakMinutes - resolved.allowedBreakMinutes)

    const record = await prisma.dTRRecord.update({
      where: { id: existing.id },
      data: {
        timeOut: now,
        breakOut: existing.breakIn && !existing.breakOut ? now : undefined,
        regularHours,
        overtimeHours,
        nightDiffHours,
        lateMinutes: lateMinutes + overBreakMinutes,
        undertimeMinutes,
      },
    })

    await syncAutoOvertimeRequest({
      companyId: ctx.companyId,
      employeeId: employee.id,
      date: record.date,
      timeIn: record.timeIn,
      timeOut: record.timeOut,
      overtimeHours: Number(record.overtimeHours ?? 0),
    })

    return NextResponse.json({ record, message: `${employee.firstName} ${employee.lastName} clocked out successfully` })
  }
}
