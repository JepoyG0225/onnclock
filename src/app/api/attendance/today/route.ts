import { resolveAttendanceLocation } from '@/lib/attendance/schedule-location'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'
import { getManilaDateOnly, getManilaDayOfWeek } from '@/lib/date-manila'

function normalizeWorkDays(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is number => typeof v === 'number' && v >= 0 && v <= 6)
}

function normalizeBreakMinutes(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 60
  return Math.max(0, Math.min(720, Math.round(n)))
}

async function getCompanyDefaultBreakMinutes(companyId: string): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ defaultBreakMinutes: number | null }>>`
      SELECT "defaultBreakMinutes"
      FROM "companies"
      WHERE "id" = ${companyId}
      LIMIT 1
    `
    return normalizeBreakMinutes(rows?.[0]?.defaultBreakMinutes)
  } catch {
    return 60
  }
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  const employeeId = await resolvePortalEmployeeId(ctx)
  const employee = employeeId ? await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      disableHolidayPay: true,
      firstName: true,
      lastName: true,
      workScheduleId: true,
      workSchedule: { select: { id: true, name: true, requireSelfieOnClockIn: true, breakMinutes: true, breakEnabled: true, workDays: true } },
    },
  }) : null
  if (!employee) return NextResponse.json({ record: null })

  const manilaDate = (await resolveAttendanceLocation(ctx.companyId,employee.id)).date
  const dayOfWeek = manilaDate.getUTCDay()

  const activeRecord = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null },
    orderBy: { timeIn: 'desc' },
  })
  const record = activeRecord ?? await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, date: manilaDate },
    orderBy: [{ timeIn: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
  })

  const fixedScheduleSet = !!employee.workScheduleId
  let scheduleReady = false
  let scheduleMessage: string | null = null
  const companyDefaultBreakMinutes = await getCompanyDefaultBreakMinutes(ctx.companyId)

  // Look up ALL shift assignments for today (multi-shift support).
  const assignmentsToday = await prisma.employeeShiftAssignment.findMany({
    where: { companyId: ctx.companyId, employeeId: employee.id, date: manilaDate },
    select: {
      scheduleId: true,
      timeIn: true,
      timeOut: true,
      isRestDay: true,
      schedule: { select: { breakMinutes: true, breakEnabled: true } },
    },
  })

  // First non-rest-day assignment (used for break minutes priority)
  const workAssignment = assignmentsToday.find(
    a => !a.isRestDay && (!!a.scheduleId || (!!a.timeIn && !!a.timeOut))
  )
  const assignmentIsWorkDay = !!workAssignment
  const allMarkedRestDay = assignmentsToday.length > 0 && assignmentsToday.every(a => a.isRestDay)

  const fixedRestDay = fixedScheduleSet && !assignmentIsWorkDay && !normalizeWorkDays(employee.workSchedule?.workDays).includes(dayOfWeek)
  if (allMarkedRestDay || fixedRestDay) {
    scheduleReady = true
    scheduleMessage = 'You may clock in on your rest day. HR must approve this additional shift.'
  } else if (fixedScheduleSet || assignmentIsWorkDay) {
    scheduleReady = true
  } else {
    scheduleReady = false
    scheduleMessage = 'No work schedule is set for you yet. Please contact your admin.'
  }

  // breakMinutes: 0 = break disabled, >0 = allowed break duration in minutes
  // Priority: explicit assignment schedule override > fixed employee schedule > company default.
  // If either source's schedule has breakEnabled=false, return 0 — the portal
  // uses this value to hide the Start/End Break buttons entirely.
  const breakDisabled =
    workAssignment?.schedule?.breakEnabled === false ||
    (!workAssignment && employee.workSchedule?.breakEnabled === false)
  const breakMinutes = breakDisabled || (record?.isHalfDay && !record.isLeave) ? 0 : normalizeBreakMinutes(
    workAssignment?.schedule?.breakMinutes ??
      employee.workSchedule?.breakMinutes ??
      companyDefaultBreakMinutes
  )

  // Strip clockInPhoto — large base64 payload not needed by the clock page
  const safeRecord = record ? Object.fromEntries(
    Object.entries(record).filter(([k]) => !['clockOutPhoto', 'clockInPhoto', 'breakInPhoto', 'breakOutPhoto'].includes(k))
  ) : null
  return NextResponse.json({ record: safeRecord, employee, scheduleReady, scheduleMessage, breakMinutes })
}
