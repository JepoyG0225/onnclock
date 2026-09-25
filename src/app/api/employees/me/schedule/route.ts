import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'

const updateSchema = z.object({ scheduleId: z.string().min(1) })

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

  const [employee, schedules] = await Promise.all([
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
  ])

  if (!employee) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })

  return NextResponse.json({
    enabled: employee.canSelectOwnSchedule,
    currentScheduleId: employee.workScheduleId,
    schedules: employee.canSelectOwnSchedule ? schedules : [],
  })
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Select a valid schedule.' }, { status: 400 })

  const employeeId = await resolvePortalEmployeeId(ctx)
  if (!employeeId) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })

  const [company, schedule] = await Promise.all([
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { employeeScheduleSelectionEnabled: true },
    }),
    prisma.workSchedule.findFirst({
      where: { id: parsed.data.scheduleId, companyId: ctx.companyId, isActive: true },
      select: { id: true, name: true },
    }),
  ])

  if (!company?.employeeScheduleSelectionEnabled) {
    return NextResponse.json({ error: 'Employee schedule selection is disabled by your administrator.' }, { status: 403 })
  }
  if (!schedule) return NextResponse.json({ error: 'That schedule is unavailable.' }, { status: 404 })

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: ctx.companyId },
    select: { id: true, workScheduleId: true, canSelectOwnSchedule: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })
  if (!employee.canSelectOwnSchedule) {
    return NextResponse.json({ error: 'You are not allowed to select your own schedule.' }, { status: 403 })
  }

  await prisma.employee.update({
    where: { id: employee.id },
    data: { workScheduleId: schedule.id },
  })

  logAudit(ctx, 'UPDATE', 'EmployeeSchedule', employee.id, {
    description: `Employee selected work schedule "${schedule.name}"`,
    oldValues: { workScheduleId: employee.workScheduleId },
    newValues: { workScheduleId: schedule.id },
  }).catch(() => {})

  return NextResponse.json({ schedule })
}
