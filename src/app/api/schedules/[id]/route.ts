import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  scheduleType: z.enum(['FIXED', 'FLEXITIME', 'SHIFTING', 'COMPRESSED']).optional(),
  requireSelfieOnClockIn: z.boolean().optional(),
  timeIn: z.string().optional().nullable(),
  timeOut: z.string().optional().nullable(),
  workDays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  breakMinutes: z.number().int().min(0).max(240).optional().nullable(),
  workHoursPerDay: z.number().min(1).max(24).optional().nullable(),
  workDaysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(ctx.role)) {
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
    const updateData: Parameters<typeof prisma.workSchedule.update>[0]['data'] = {}

    if (data.name !== undefined) updateData.name = data.name
    if (data.scheduleType !== undefined) updateData.scheduleType = data.scheduleType
    if (data.workDays !== undefined) updateData.workDays = data.workDays
    if (data.timeIn !== undefined) updateData.timeIn = data.timeIn ?? null
    if (data.timeOut !== undefined) updateData.timeOut = data.timeOut ?? null
    if (data.breakMinutes !== undefined) updateData.breakMinutes = data.breakMinutes ?? 60
    if (data.workHoursPerDay !== undefined) updateData.workHoursPerDay = data.workHoursPerDay ?? 8
    if (data.workDaysPerWeek !== undefined) {
      const existingWorkDaysCount = Array.isArray(existing.workDays) ? existing.workDays.length : 5
      updateData.workDaysPerWeek = data.workDaysPerWeek ?? existingWorkDaysCount
    }
    // Only write requireSelfieOnClockIn when explicitly set to true (avoids column-missing error)
    if (data.requireSelfieOnClockIn !== undefined && data.requireSelfieOnClockIn) {
      updateData.requireSelfieOnClockIn = true
    } else if (data.requireSelfieOnClockIn === false) {
      updateData.requireSelfieOnClockIn = false
    }

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
