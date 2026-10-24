import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduleId: z.string().min(1).nullable(),
})

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employeeId = await resolvePortalEmployeeId(ctx)
  if (!employeeId) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { employeeScheduleSelectionEnabled: true },
  })

  if (!company?.employeeScheduleSelectionEnabled) {
    return NextResponse.json({ enabled: false, currentScheduleId: null, schedules: [] })
  }

  const today = new Date()
  const rangeStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1))
  const rangeEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 31))

  const [employee, schedules, assignments] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: employeeId, companyId: ctx.companyId },
      select: { workScheduleId: true, canSelectOwnSchedule: true },
    }),
    prisma.workSchedule.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        scheduleType: true,
        timeIn: true,
        timeOut: true,
        workDays: true,
        workHoursPerDay: true,
      },
    }),
    prisma.employeeShiftAssignment.findMany({
      where: {
        companyId: ctx.companyId,
        employeeId,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, scheduleId: true, isRestDay: true },
    }),
  ])

  if (!employee) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })

  return NextResponse.json({
    enabled: employee.canSelectOwnSchedule,
    defaultScheduleId: employee.workScheduleId,
    schedules: employee.canSelectOwnSchedule ? schedules : [],
    assignments: employee.canSelectOwnSchedule
      ? assignments.map(assignment => ({ ...assignment, date: dateKey(assignment.date) }))
      : [],
  })
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Select a valid schedule.' }, { status: 400 })

  const employeeId = await resolvePortalEmployeeId(ctx)
  if (!employeeId) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })

  const requestedDate = dateOnly(parsed.data.date)
  if (Number.isNaN(requestedDate.getTime())) {
    return NextResponse.json({ error: 'Select a valid date.' }, { status: 400 })
  }
  const now = new Date()
  const earliest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const latest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 60))
  if (requestedDate < earliest || requestedDate > latest) {
    return NextResponse.json({ error: 'Schedules can be changed from today through the next 60 days.' }, { status: 400 })
  }

  const [company, schedule] = await Promise.all([
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { employeeScheduleSelectionEnabled: true },
    }),
    parsed.data.scheduleId
      ? prisma.workSchedule.findFirst({
          where: { id: parsed.data.scheduleId, companyId: ctx.companyId, isActive: true },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ])

  if (!company?.employeeScheduleSelectionEnabled) {
    return NextResponse.json({ error: 'Employee schedule selection is disabled by your administrator.' }, { status: 403 })
  }
  if (parsed.data.scheduleId && !schedule) return NextResponse.json({ error: 'That schedule is unavailable.' }, { status: 404 })

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: ctx.companyId },
    select: { id: true, workScheduleId: true, canSelectOwnSchedule: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })
  if (!employee.canSelectOwnSchedule) {
    return NextResponse.json({ error: 'You are not allowed to select your own schedule.' }, { status: 403 })
  }

  const existing = await prisma.employeeShiftAssignment.findFirst({
    where: { companyId: ctx.companyId, employeeId: employee.id, date: requestedDate },
    select: { id: true, scheduleId: true, isRestDay: true },
  })

  if (!parsed.data.scheduleId) {
    if (existing) await prisma.employeeShiftAssignment.delete({ where: { id: existing.id } })
  } else if (existing) {
    await prisma.employeeShiftAssignment.update({
      where: { id: existing.id },
      data: { scheduleId: parsed.data.scheduleId, timeIn: null, timeOut: null, isRestDay: false, notes: 'Selected by employee' },
    })
  } else {
    await prisma.employeeShiftAssignment.create({
      data: {
        companyId: ctx.companyId,
        employeeId: employee.id,
        date: requestedDate,
        scheduleId: parsed.data.scheduleId,
        isRestDay: false,
        notes: 'Selected by employee',
      },
    })
  }

  logAudit(ctx, 'UPDATE', 'EmployeeSchedule', employee.id, {
    description: schedule
      ? `Employee selected work schedule "${schedule.name}" for ${parsed.data.date}`
      : `Employee restored the default work schedule for ${parsed.data.date}`,
    oldValues: { date: parsed.data.date, scheduleId: existing?.scheduleId ?? null, isRestDay: existing?.isRestDay ?? false },
    newValues: { date: parsed.data.date, scheduleId: schedule?.id ?? null, usesDefault: !schedule },
  }).catch(() => {})

  return NextResponse.json({ date: parsed.data.date, schedule, usesDefault: !schedule })
}
