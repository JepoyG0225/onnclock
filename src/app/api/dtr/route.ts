import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildOtMapKey, getApprovedOtHoursMap, syncAutoOvertimeRequest } from '@/lib/overtime-requests'
import {
  computeHours,
  computeLateAndUndertime,
  getCompanyNightDiffWindow,
  plannedShiftMinutes,
  resolveShiftForDtr,
} from '@/lib/timesheet/compute'
import { HolidayType } from '@prisma/client'
import { z } from 'zod'

const dtrSchema = z.object({
  employeeId: z.string(),
  date: z.string(), // YYYY-MM-DD
  timeIn: z.string().optional().nullable(),
  timeOut: z.string().optional().nullable(),
  regularHours: z.number().min(0).max(24).default(0),
  overtimeHours: z.number().min(0).max(12).default(0),
  nightDiffHours: z.number().min(0).max(12).default(0),
  lateMinutes: z.number().min(0).default(0),
  undertimeMinutes: z.number().min(0).default(0),
  isAbsent: z.boolean().default(false),
  isRestDay: z.boolean().default(false),
  isHoliday: z.boolean().default(false),
  holidayType: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const companyId = resolveCompanyIdForRequest(ctx, req)
  const employeeId  = searchParams.get('employeeId')
  const periodStart = searchParams.get('from')
  const periodEnd   = searchParams.get('to')
  const completed   = searchParams.get('completed')
  const page        = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit       = Math.min(2000, parseInt(searchParams.get('limit') ?? '31'))

  const where: Record<string, unknown> = {}
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }
  where.employee = {
    companyId,
    ...(employeeId ? { id: employeeId } : {}),
  }

  if (periodStart && periodEnd) {
    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    const endPlus = new Date(end)
    endPlus.setDate(endPlus.getDate() + 1)
    where.date = {
      gte: start,
      lt: endPlus,
    }
  }

  if (completed === '1' || completed === 'true') {
    where.timeOut = { not: null }
  }

  const [records, total, approvedOtMap] = await Promise.all([
    prisma.dTRRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeNo: true,
            department: { select: { name: true } },
            workSchedule: { select: { workDays: true } },
          },
        },
        _count: {
          select: {
            screenCaptures: true,
          },
        },
      },
      orderBy: [{ date: 'desc' }, { employee: { lastName: 'asc' } }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.dTRRecord.count({ where }),
    periodStart && periodEnd
      ? getApprovedOtHoursMap({
          companyId,
          dateFrom: new Date(periodStart),
          dateTo: new Date(periodEnd),
        })
      : Promise.resolve(new Map<string, number>()),
  ])

  const normalized = records.map(({ _count, ...record }) => ({
    ...record,
    overtimeHours: approvedOtMap.get(buildOtMapKey(record.employeeId, record.date)) ?? 0,
    screenCaptureCount: _count.screenCaptures,
  }))

  return NextResponse.json({ records: normalized, total, page, limit })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = dtrSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data

  // Verify employee belongs to same company AND load shift info for recompute
  const [employee, companyRow] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: data.employeeId, companyId },
      select: {
        id: true,
        workScheduleId: true,
        workSchedule: { select: { timeIn: true, timeOut: true, breakMinutes: true } },
      },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultBreakMinutes: true },
    }),
  ])
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Combine date + HH:mm time strings into full DateTime for DB storage.
  // Append +08:00 (PST) so Vercel (UTC) stores the correct UTC equivalent.
  // e.g. "11:46 PH" → 2026-04-17T11:46:00+08:00 → stored as 03:46 UTC
  // Without this, "11:46" is parsed as UTC and the timesheet displays 19:46 PH.
  const timeIn  = data.timeIn  ? new Date(`${data.date}T${data.timeIn}:00+08:00`)  : null
  const timeOut = data.timeOut ? new Date(`${data.date}T${data.timeOut}:00+08:00`) : null
  const recordDate = new Date(data.date)

  // When BOTH timeIn and timeOut are provided, ALWAYS recompute hours from the
  // times against the employee's planned shift. This prevents admins from
  // entering inconsistent values via the form (the root cause of the Loyola
  // K-12 audit drift). Form-submitted regularHours/overtimeHours/etc. are
  // only honored when there's no time pair to compute from (absent/rest-day).
  let computedHours: ReturnType<typeof computeHours> | null = null
  let computedLateUt: ReturnType<typeof computeLateAndUndertime> | null = null
  if (timeIn && timeOut) {
    const resolved = await resolveShiftForDtr({
      employeeId: data.employeeId,
      date: recordDate,
      actualTimeIn: timeIn,
      employee: {
        workScheduleId: employee.workScheduleId,
        workSchedule: employee.workSchedule,
      },
      defaultBreakMinutes: companyRow?.defaultBreakMinutes ?? 60,
    })
    const planned = plannedShiftMinutes(resolved.scheduleTimeIn, resolved.scheduleTimeOut)
    const ndWindow = await getCompanyNightDiffWindow(companyId)
    computedHours = computeHours(timeIn, timeOut, null, null, {
      plannedRegularMinutes: planned,
      allowedBreakMinutes: resolved.allowedBreakMinutes,
      nightDiffStartMins: ndWindow.startMins,
      nightDiffEndMins: ndWindow.endMins,
      nightDiffIncludesBreak: ndWindow.includesBreak,
    })
    computedLateUt = computeLateAndUndertime(timeIn, timeOut, resolved.scheduleTimeIn, resolved.scheduleTimeOut)
  }

  // Multi-shift: an employee can have multiple DTR rows per day.
  // Match the existing row by (employeeId, date) — when several rows exist for
  // the same date the admin form is editing the most-recently-created one.
  const existing = await prisma.dTRRecord.findFirst({
    where: { employeeId: data.employeeId, date: recordDate },
    orderBy: { createdAt: 'desc' },
  })
  const dataPayload = {
    employeeId:       data.employeeId,
    date:             recordDate,
    timeIn,
    timeOut,
    regularHours:     computedHours?.regularHours ?? data.regularHours,
    overtimeHours:    computedHours?.overtimeHours ?? data.overtimeHours,
    nightDiffHours:   computedHours?.nightDiffHours ?? data.nightDiffHours,
    lateMinutes:      computedLateUt?.lateMinutes ?? data.lateMinutes,
    undertimeMinutes: computedLateUt?.undertimeMinutes ?? data.undertimeMinutes,
    isAbsent:         data.isAbsent,
    isRestDay:        data.isRestDay,
    isHoliday:        data.isHoliday,
    holidayType:      (data.holidayType ?? null) as HolidayType | null,
    remarks:          data.remarks ?? null,
  }
  const record = existing
    ? await prisma.dTRRecord.update({ where: { id: existing.id }, data: dataPayload })
    : await prisma.dTRRecord.create({ data: dataPayload })

  await syncAutoOvertimeRequest({
    companyId,
    employeeId: data.employeeId,
    date: record.date,
    timeIn: record.timeIn,
    timeOut: record.timeOut,
    overtimeHours: Number(record.overtimeHours ?? 0),
  })

  return NextResponse.json(record, { status: 201 })
}
