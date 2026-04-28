import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { differenceInMinutes } from 'date-fns'
import { z } from 'zod'

const schema = z.object({
  employeeId: z.string().min(1),
  action: z.enum(['end-break', 'clock-out']),
})

function normalizeBreakMinutes(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 60
  return Math.max(0, Math.min(720, Math.round(n)))
}

function getManilaMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return (
    Number(parts.find(p => p.type === 'hour')?.value ?? '0') * 60 +
    Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  )
}

function getManilaHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Number(parts.find(p => p.type === 'hour')?.value ?? '0')
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function computeHours(timeIn: Date, timeOut: Date, breakIn: Date | null, breakOut: Date | null) {
  const MAX_SHIFT_MINUTES = 24 * 60
  const totalMinutes = Math.min(differenceInMinutes(timeOut, timeIn), MAX_SHIFT_MINUTES)
  const effectiveTimeOut = new Date(timeIn.getTime() + totalMinutes * 60_000)
  const breakMinutes =
    breakIn && breakOut
      ? Math.max(0, differenceInMinutes(
          breakOut > effectiveTimeOut ? effectiveTimeOut : breakOut,
          breakIn < timeIn ? timeIn : breakIn,
        ))
      : 0
  const workedMinutes = Math.max(0, totalMinutes - breakMinutes)
  const regularMinutes = Math.min(workedMinutes, 8 * 60)
  const overtimeMinutes = Math.max(0, workedMinutes - 8 * 60)

  let nightDiffMinutes = 0
  let cursor = new Date(timeIn)
  while (cursor < effectiveTimeOut) {
    if (breakIn && breakOut && cursor >= breakIn && cursor < breakOut) {
      cursor = new Date(cursor.getTime() + 60_000)
      continue
    }
    const h = getManilaHour(cursor)
    if (h >= 22 || h < 6) nightDiffMinutes++
    cursor = new Date(cursor.getTime() + 60_000)
  }

  return {
    regularHours: Math.round((regularMinutes / 60) * 100) / 100,
    overtimeHours: Math.round((overtimeMinutes / 60) * 100) / 100,
    nightDiffHours: Math.round((nightDiffMinutes / 60) * 100) / 100,
  }
}

function computeLateAndUndertime(
  timeIn: Date,
  timeOut: Date,
  scheduleTimeIn: string | null | undefined,
  scheduleTimeOut: string | null | undefined,
) {
  const scheduledInMins = parseTimeToMinutes(scheduleTimeIn)
  if (scheduledInMins == null) return { lateMinutes: 0, undertimeMinutes: 0 }

  const scheduledOutMins = parseTimeToMinutes(scheduleTimeOut)
  const isOvernight = scheduledOutMins != null && scheduledOutMins <= scheduledInMins
  const actualInMins = getManilaMinutes(timeIn)
  const actualOutMins = getManilaMinutes(timeOut)

  let normalizedInMins = actualInMins
  if (isOvernight && actualInMins < scheduledInMins && actualInMins < 12 * 60) {
    normalizedInMins = actualInMins + 24 * 60
  }
  const lateMinutes = Math.max(0, normalizedInMins - scheduledInMins)

  let undertimeMinutes = 0
  if (scheduledOutMins != null) {
    if (isOvernight) {
      if (actualOutMins < 12 * 60) undertimeMinutes = Math.max(0, scheduledOutMins - actualOutMins)
    } else {
      undertimeMinutes = Math.max(0, scheduledOutMins - actualOutMins)
    }
  }

  return { lateMinutes, undertimeMinutes }
}

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

    const { regularHours, overtimeHours, nightDiffHours } = computeHours(
      existing.timeIn!,
      now,
      effectiveBreakIn,
      effectiveBreakOut,
    )

    let scheduleTimeIn = employee.workSchedule?.timeIn
    let scheduleTimeOut = employee.workSchedule?.timeOut
    if (!employee.workScheduleId && existing.date) {
      const rows = await prisma.$queryRaw<Array<{
        timeIn: string | null; timeOut: string | null
        schedTimeIn: string | null; schedTimeOut: string | null
      }>>`
        SELECT esa."timeIn", esa."timeOut", ws."timeIn" AS "schedTimeIn", ws."timeOut" AS "schedTimeOut"
        FROM "employee_shift_assignments" esa
        LEFT JOIN "work_schedules" ws ON ws.id = esa."scheduleId"
        WHERE esa."employeeId" = ${employee.id} AND esa."date" = ${existing.date}
        LIMIT 1
      `
      const a = rows[0]
      if (a) {
        scheduleTimeIn = a.timeIn ?? a.schedTimeIn ?? scheduleTimeIn
        scheduleTimeOut = a.timeOut ?? a.schedTimeOut ?? scheduleTimeOut
      }
    }

    const { lateMinutes, undertimeMinutes } = computeLateAndUndertime(
      existing.timeIn!,
      now,
      scheduleTimeIn,
      scheduleTimeOut,
    )

    const allowedBreakMinutes = normalizeBreakMinutes(
      employee.workSchedule?.breakMinutes ?? 60
    )
    const overBreakMinutes = effectiveBreakIn && effectiveBreakOut
      ? Math.max(0, differenceInMinutes(effectiveBreakOut, effectiveBreakIn) - allowedBreakMinutes)
      : 0

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
    return NextResponse.json({ record, message: `${employee.firstName} ${employee.lastName} clocked out successfully` })
  }
}
