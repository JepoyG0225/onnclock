import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'

const weekPatternSchema = z.object({
  label: z.string(),
  workDays: z.array(z.number().int().min(0).max(6)),
})

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  scheduleType: z.enum(['FIXED', 'FLEXITIME', 'SHIFTING', 'COMPRESSED']).optional(),
  requireSelfieOnClockIn: z.boolean().optional(),
  timeIn: z.string().optional().nullable(),
  timeOut: z.string().optional().nullable(),
  workDays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  breakEnabled: z.boolean().optional(),
  breakMinutes: z.number().int().min(0).max(240).optional().nullable(),
  workHoursPerDay: z.number().min(1).max(24).optional().nullable(),
  workDaysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
  repeatCycle: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional(),
  cycleWeeks: z.array(weekPatternSchema).optional().nullable(),
  cycleStartDate: z.string().optional().nullable(),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'DEPARTMENT_HEAD'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.workSchedule.findFirst({
      where: { id, companyId: ctx.companyId, isActive: true },
    })
    if (!existing) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const data = parsed.data
    const repeatCycle = data.repeatCycle ?? (existing as Record<string, unknown>).repeatCycle as string ?? 'WEEKLY'

    if (repeatCycle === 'BIWEEKLY' && data.cycleWeeks !== undefined && data.cycleWeeks !== null && data.cycleWeeks.length !== 2) {
      return NextResponse.json({ error: 'Biweekly schedules require exactly 2 week patterns.' }, { status: 400 })
    }
    if (repeatCycle === 'MONTHLY' && data.cycleWeeks !== undefined && data.cycleWeeks !== null && data.cycleWeeks.length !== 4) {
      return NextResponse.json({ error: 'Monthly schedules require exactly 4 week patterns.' }, { status: 400 })
    }

    const updateData: Parameters<typeof prisma.workSchedule.update>[0]['data'] = {}

    if (data.name !== undefined) updateData.name = data.name
    if (data.scheduleType !== undefined) updateData.scheduleType = data.scheduleType

    // Determine primary workDays (first cycle week or explicit)
    const cycleWeeksToUse = data.cycleWeeks ?? null
    if (data.workDays !== undefined) {
      updateData.workDays = cycleWeeksToUse?.length ? cycleWeeksToUse[0].workDays : data.workDays
    } else if (cycleWeeksToUse?.length) {
      updateData.workDays = cycleWeeksToUse[0].workDays
    }

    if (data.timeIn !== undefined) updateData.timeIn = data.timeIn ?? null
    if (data.timeOut !== undefined) updateData.timeOut = data.timeOut ?? null
    if (data.breakEnabled !== undefined) updateData.breakEnabled = data.breakEnabled
    if (data.breakMinutes !== undefined) updateData.breakMinutes = data.breakMinutes ?? 60
    if (data.workHoursPerDay !== undefined) updateData.workHoursPerDay = data.workHoursPerDay ?? 8
    if (data.workDaysPerWeek !== undefined) {
      const existingCount = Array.isArray(existing.workDays) ? existing.workDays.length : 5
      updateData.workDaysPerWeek = data.workDaysPerWeek ?? existingCount
    }

    if (data.requireSelfieOnClockIn !== undefined) {
      updateData.requireSelfieOnClockIn = data.requireSelfieOnClockIn
    }

    // NOTE: repeatCycle/cycleWeeks/cycleStartDate are intentionally not written here
    // until the generated Prisma client in this environment includes those fields.

    const updated = await prisma.workSchedule.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { employees: true } },
        scheduleShifts: { orderBy: { dayOfWeek: 'asc' } },
      },
    })

    return NextResponse.json({ schedule: updated })
  } catch (err) {
    console.error('[PUT /api/schedules/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    if (!['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.workSchedule.findFirst({
      where: { id, companyId: ctx.companyId },
      include: { _count: { select: { employees: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })

    if (existing._count.employees > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${existing._count.employees} employee(s) are assigned to this schedule.` },
        { status: 409 }
      )
    }

    await prisma.workSchedule.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/schedules/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
