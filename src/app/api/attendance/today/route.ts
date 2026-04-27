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
    include: {
      workSchedule: { select: { id: true, name: true, requireSelfieOnClockIn: true, breakMinutes: true, workDays: true } },
    },
  }) : null
  if (!employee) return NextResponse.json({ record: null })

  const manilaDate = getManilaDateOnly()
  const dayOfWeek = getManilaDayOfWeek()

  const activeRecord = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null },
    orderBy: { timeIn: 'desc' },
  })
  const record = activeRecord ?? await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, date: manilaDate },
  })

  const fixedScheduleSet = !!employee.workScheduleId
  let scheduleReady = false
  let scheduleMessage: string | null = null
  const companyDefaultBreakMinutes = await getCompanyDefaultBreakMinutes(ctx.companyId)

  // Always look up today's shift assignment — it acts as an override for both
  // fixed-schedule employees (rest-day exception) and flexible employees.
  const assignment = await prisma.employeeShiftAssignment.findFirst({
    where: { companyId: ctx.companyId, employeeId: employee.id, date: manilaDate },
    select: {
      scheduleId: true,
      timeIn: true,
      timeOut: true,
      isRestDay: true,
      schedule: { select: { breakMinutes: true } },
    },
  })

  const assignmentIsWorkDay =
    !!assignment &&
    !assignment.isRestDay &&
    (!!assignment.scheduleId || (!!assignment.timeIn && !!assignment.timeOut))

  if (fixedScheduleSet) {
    // Fixed schedule: check if today is in the scheduled work days
    const workDays = normalizeWorkDays(employee.workSchedule?.workDays)
    const isScheduledWorkDay = workDays.includes(dayOfWeek)

    if (isScheduledWorkDay || assignmentIsWorkDay) {
      // Either a normal work day OR an explicit shift-assignment override
      scheduleReady = true
    } else {
      scheduleReady = false
      scheduleMessage = 'Today is your rest day based on your fixed schedule.'
    }
  } else {
    // Flexible employee: must have a non-rest-day assignment today
    if (assignmentIsWorkDay) {
      scheduleReady = true
    } else if (assignment?.isRestDay) {
      scheduleReady = false
      scheduleMessage = 'Today is marked as rest day in your flexible schedule.'
    } else {
      scheduleReady = false
      scheduleMessage = 'No work schedule is set for you yet. Please contact your admin.'
    }
  }

  // breakMinutes: 0 = break disabled, >0 = allowed break duration in minutes
  // Priority: explicit assignment schedule override > fixed employee schedule > company default.
  const breakMinutes = normalizeBreakMinutes(
    assignment?.schedule?.breakMinutes ??
      employee.workSchedule?.breakMinutes ??
      companyDefaultBreakMinutes
  )

  return NextResponse.json({ record, employee, scheduleReady, scheduleMessage, breakMinutes })
}
