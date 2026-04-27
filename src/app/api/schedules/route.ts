import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'

const weekPatternSchema = z.object({
  label: z.string(),
  workDays: z.array(z.number().int().min(0).max(6)),
})

const scheduleSchema = z.object({
  name: z.string().min(2),
  scheduleType: z.enum(['FIXED', 'FLEXITIME', 'SHIFTING', 'COMPRESSED']),
  requireSelfieOnClockIn: z.boolean().optional(),
  timeIn: z.string().optional().nullable(),
  timeOut: z.string().optional().nullable(),
  workDays: z.array(z.number().int().min(0).max(6)).min(1),
  breakMinutes: z.number().int().min(0).max(240).optional().nullable(),
  workHoursPerDay: z.number().min(1).max(24).optional().nullable(),
  workDaysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
  repeatCycle: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional().default('WEEKLY'),
  cycleWeeks: z.array(weekPatternSchema).optional().nullable(),
  cycleStartDate: z.string().optional().nullable(), // ISO date string
})

export async function GET() {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    // One-time self-healing cleanup: remove auto-generated "Custom Day Offs" work schedules
    // that were created by the old employee-update logic. These pollute the Work Hours list.
    // First detach any employees still pointing to them, then delete the schedules.
    try {
      const staleSchedules = await prisma.workSchedule.findMany({
        where: { companyId: ctx.companyId, name: { endsWith: ' - Custom Day Offs' } },
        select: { id: true },
      })
      if (staleSchedules.length > 0) {
        const staleIds = staleSchedules.map(s => s.id)
        await prisma.employee.updateMany({
          where: { companyId: ctx.companyId, workScheduleId: { in: staleIds } },
          data: { workScheduleId: null },
        })
        await prisma.workSchedule.deleteMany({
          where: { id: { in: staleIds } },
        })
      }
    } catch {
      // Non-fatal — proceed even if cleanup fails
    }

    let schedules = await prisma.workSchedule.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      include: {
        _count: { select: { employees: true } },
        scheduleShifts: { orderBy: { dayOfWeek: 'asc' } },
      },
      orderBy: { name: 'asc' },
    })

    // Fallback: if no active templates are found, surface templates that are still
    // referenced by employees or day assignments (often after soft-delete/reset flows).
    if (schedules.length === 0) {
      const [employeeRefs, assignmentRefs] = await Promise.all([
        prisma.employee.findMany({
          where: { companyId: ctx.companyId, workScheduleId: { not: null } },
          select: { workScheduleId: true },
          distinct: ['workScheduleId'],
        }),
        prisma.employeeShiftAssignment.findMany({
          where: { companyId: ctx.companyId, scheduleId: { not: null } },
          select: { scheduleId: true },
          distinct: ['scheduleId'],
        }),
      ])

      const linkedIds = Array.from(
        new Set([
          ...employeeRefs.map(r => r.workScheduleId).filter((v): v is string => Boolean(v)),
          ...assignmentRefs.map(r => r.scheduleId).filter((v): v is string => Boolean(v)),
        ])
      )

      if (linkedIds.length > 0) {
        schedules = await prisma.workSchedule.findMany({
          where: { companyId: ctx.companyId, id: { in: linkedIds } },
          include: {
            _count: { select: { employees: true } },
            scheduleShifts: { orderBy: { dayOfWeek: 'asc' } },
          },
          orderBy: { name: 'asc' },
        })
      }
    }

    return NextResponse.json({ schedules })
  } catch (err) {
    console.error('[GET /api/schedules]', err)
    return NextResponse.json({ error: 'Failed to load schedules' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = scheduleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const data = parsed.data
    const repeatCycle = data.repeatCycle ?? 'WEEKLY'

    // For BIWEEKLY/MONTHLY, validate cycleWeeks has the right count
    if (repeatCycle === 'BIWEEKLY' && (!data.cycleWeeks || data.cycleWeeks.length !== 2)) {
      return NextResponse.json({ error: 'Biweekly schedules require exactly 2 week patterns.' }, { status: 400 })
    }
    if (repeatCycle === 'MONTHLY' && (!data.cycleWeeks || data.cycleWeeks.length !== 4)) {
      return NextResponse.json({ error: 'Monthly schedules require exactly 4 week patterns.' }, { status: 400 })
    }

    // workDays = first cycle week's days (or explicit workDays for WEEKLY)
    const primaryWorkDays =
      repeatCycle !== 'WEEKLY' && data.cycleWeeks?.length
        ? data.cycleWeeks[0].workDays
        : data.workDays

    const scheduleData: Parameters<typeof prisma.workSchedule.create>[0]['data'] = {
      companyId: ctx.companyId,
      name: data.name,
      scheduleType: data.scheduleType,
      workDays: primaryWorkDays,
      timeIn: data.timeIn ?? null,
      timeOut: data.timeOut ?? null,
      breakMinutes: data.breakMinutes ?? 60,
      workHoursPerDay: data.workHoursPerDay ?? 8,
      workDaysPerWeek: data.workDaysPerWeek ?? primaryWorkDays.length,
    }

    if (data.requireSelfieOnClockIn) scheduleData.requireSelfieOnClockIn = true

    // NOTE: repeatCycle/cycleWeeks/cycleStartDate are intentionally not written here
    // until the generated Prisma client in this environment includes those fields.

    const created = await prisma.workSchedule.create({ data: scheduleData })

    return NextResponse.json({ schedule: created }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/schedules]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
