import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'

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
})

export async function GET() {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    const schedules = await prisma.workSchedule.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      include: {
        _count: { select: { employees: true } },
        scheduleShifts: { orderBy: { dayOfWeek: 'asc' } },
      },
      orderBy: { name: 'asc' },
    })

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
    // Only include requireSelfieOnClockIn when true — omitting it lets the DB
    // use its DEFAULT false, which also works if the column migration hasn't run yet.
    const scheduleData: Parameters<typeof prisma.workSchedule.create>[0]['data'] = {
      companyId: ctx.companyId,
      name: data.name,
      scheduleType: data.scheduleType,
      workDays: data.workDays,
      timeIn: data.timeIn ?? null,
      timeOut: data.timeOut ?? null,
      breakMinutes: data.breakMinutes ?? 60,
      workHoursPerDay: data.workHoursPerDay ?? 8,
      workDaysPerWeek: data.workDaysPerWeek ?? data.workDays.length,
    }
    if (data.requireSelfieOnClockIn) {
      scheduleData.requireSelfieOnClockIn = true
    }
    const created = await prisma.workSchedule.create({ data: scheduleData })

    return NextResponse.json({ schedule: created }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/schedules]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
