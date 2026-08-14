import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildOtMapKey, getApprovedOtHoursMap, isOvertimeEnabledForCompany } from '@/lib/overtime-requests'
import { dtrSchema, upsertDtrRecord } from '@/lib/timesheet/dtr-upsert'

function rawOvertimeHours(record: { overtimeHours: unknown; regularHours: unknown; timeIn: Date | null; timeOut: Date | null; breakIn: Date | null; breakOut: Date | null }) {
  const stored = Number(record.overtimeHours ?? 0)
  if (stored > 0 || !record.timeIn || !record.timeOut) return stored
  let elapsed = (record.timeOut.getTime() - record.timeIn.getTime()) / 3_600_000
  if (elapsed < 0) elapsed += 24
  const breakHours = record.breakIn && record.breakOut
    ? Math.max(0, (record.breakOut.getTime() - record.breakIn.getTime()) / 3_600_000)
    : 1
  return Math.round(Math.max(0, elapsed - breakHours - Number(record.regularHours ?? 0)) * 100) / 100
}

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

  const [records, total, approvedOtMap, companyOvertimeEnabled] = await Promise.all([
    prisma.dTRRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeNo: true,
            overtimePayOverride: true,
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
    isOvertimeEnabledForCompany(companyId),
  ])

  const normalized = records.map(({ _count, ...record }) => ({
    ...record,
    overtimeHours: approvedOtMap.get(buildOtMapKey(record.employeeId, record.date)) ?? 0,
    unreportedOvertimeHours: !companyOvertimeEnabled && !record.employee.overtimePayOverride
      ? rawOvertimeHours(record)
      : 0,
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

  const record = await upsertDtrRecord(companyId, parsed.data)
  if (!record) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  return NextResponse.json(record, { status: 201 })
}
