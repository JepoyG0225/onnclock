/**
 * Timesheet export — GET /api/dtr/export?from=&to=[&employeeId=][&format=]
 *
 * Scoping, the approved-OT map and the overtime-suppression rule are taken
 * from GET /api/dtr so an export can never disagree with the table it was
 * launched from.
 *
 * Unlike /api/dtr this checks `dtr:read` explicitly. That route is paginated
 * and merely authenticated; this one hands back the company's entire timesheet
 * history in one file, so it verifies the caller actually holds the timesheet
 * permission rather than just being signed in.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { buildOtMapKey, getApprovedOtHoursMap } from '@/lib/overtime-requests'
import {
  generateTimesheetsExcel,
  generateTimesheetsCsv,
  type TimesheetExportRow,
} from '@/lib/excel/timesheets'

export const runtime = 'nodejs'

/** Guards against a typo'd range dumping years of data into one workbook. */
const MAX_DAYS = 400

/**
 * A well-shaped string is not necessarily a real date — "2026-13-01" matches
 * the pattern but parses to Invalid Date, which then propagated as NaN and
 * came back as a 500. Round-tripping through Date catches month 13, day 32
 * and Feb 30.
 */
function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function labelFor(from: string, to: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  }
  const f = new Date(`${from}T00:00:00Z`).toLocaleDateString('en-US', opts)
  if (from === to) return f
  return `${f} – ${new Date(`${to}T00:00:00Z`).toLocaleDateString('en-US', opts)}`
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!(await ctxHasPermission(ctx, 'dtr:read'))) {
    return NextResponse.json({ error: 'You do not have access to timesheets.' }, { status: 403 })
  }

  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const from       = searchParams.get('from') ?? ''
  const to         = searchParams.get('to') ?? ''
  const employeeId = searchParams.get('employeeId') || undefined
  const format     = searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'

  if (!isValidDate(from) || !isValidDate(to)) {
    return NextResponse.json({ error: 'from and to are required as YYYY-MM-DD' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must not be after to' }, { status: 400 })
  }
  const spanDays =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
  if (spanDays > MAX_DAYS) {
    return NextResponse.json(
      { error: `Range too large — ${Math.round(spanDays)} days requested, limit is ${MAX_DAYS}.` },
      { status: 400 },
    )
  }

  // Half-open upper bound, matching /api/dtr: `date` is a DATE column, so a
  // `lte` on midnight would drop every record on the final day.
  const start   = new Date(`${from}T00:00:00Z`)
  const endPlus = new Date(`${to}T00:00:00Z`)
  endPlus.setUTCDate(endPlus.getUTCDate() + 1)

  const [company, settings] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    // enableOvertime lives on PayrollCycleConfig — the same row /api/payroll/settings
    // reads to decide whether the table shows OT columns at all.
    prisma.payrollCycleConfig.findUnique({
      where: { companyId },
      select: { enableOvertime: true },
    }),
  ])
  if (!company) return NextResponse.json({ error: 'No company' }, { status: 403 })

  const [records, approvedOtMap] = await Promise.all([
    prisma.dTRRecord.findMany({
      where: {
        employee: { companyId, ...(employeeId ? { id: employeeId } : {}) },
        date: { gte: start, lt: endPlus },
      },
      include: {
        employee: {
          select: {
            firstName: true, lastName: true, employeeNo: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { date: 'asc' }],
    }),
    getApprovedOtHoursMap({ companyId, dateFrom: start, dateTo: new Date(`${to}T00:00:00Z`) }),
  ])

  // When overtime pay is off the UI hides OT entirely; the export drops the
  // columns rather than shipping a zeroed one that reads as "no OT worked".
  const includeOvertime = settings?.enableOvertime ?? true

  const rows: TimesheetExportRow[] = records.map(r => ({
    employeeNo:   r.employee.employeeNo ?? '',
    lastName:     r.employee.lastName,
    firstName:    r.employee.firstName,
    department:   r.employee.department?.name ?? '',
    date:         r.date,
    timeIn:       r.timeIn,
    breakOut:     r.breakOut,
    breakIn:      r.breakIn,
    timeOut:      r.timeOut,
    regularHours: Number(r.regularHours ?? 0),
    // Approved OT comes from the request map, not the raw column — the same
    // source the table reads, so an unapproved request never lands in a export.
    overtimeHours:  approvedOtMap.get(buildOtMapKey(r.employeeId, r.date)) ?? 0,
    nightDiffHours: Number(r.nightDiffHours ?? 0),
    lateMinutes:      r.lateMinutes ?? 0,
    undertimeMinutes: r.undertimeMinutes ?? 0,
    isRestDay:  r.isRestDay,
    isHoliday:  r.isHoliday,
    holidayType: r.holidayType ?? null,
    isAbsent:   r.isAbsent,
    isLeave:    r.isLeave,
    isHalfDay:  r.isHalfDay,
    source:     r.source,
    approved:   Boolean(r.approvedBy),
    remarks:    r.remarks,
  }))

  const periodLabel = labelFor(from, to)
  const slug = from === to ? from : `${from}_to_${to}`
  const safeCompany = company.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  const filename = `timesheets-${safeCompany}-${slug}.${format}`

  if (format === 'csv') {
    const csv = generateTimesheetsCsv(rows, {
      companyName: company.name, periodLabel, includeOvertime,
    })
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const buffer = generateTimesheetsExcel(rows, {
    companyName: company.name, periodLabel, includeOvertime,
  })
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
