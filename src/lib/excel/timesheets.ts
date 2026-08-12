/**
 * Timesheet export — Detail + Summary sheets, as .xlsx or .csv.
 *
 * TIMEZONE: every time is rendered explicitly in Asia/Manila. The on-screen
 * table gets away with `format(parseISO(dt), 'HH:mm')` because it runs in the
 * user's browser, which for this product is already Manila. This code runs on
 * Vercel, where the process timezone is UTC — the same call would silently
 * shift every clock-in by 8 hours and produce an export that disagrees with
 * the screen. Match `src/lib/timesheet/compute.ts`, which does the same.
 */
import * as XLSX from 'xlsx'

const MANILA = 'Asia/Manila'

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: MANILA, hour: '2-digit', minute: '2-digit', hour12: false,
})
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANILA, year: 'numeric', month: '2-digit', day: '2-digit',
})
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: MANILA, weekday: 'short' })

function fmtTime(d: Date | null | undefined): string {
  return d ? timeFmt.format(d) : ''
}

/**
 * `date` is a Postgres `@db.Date`, which Prisma hands back as midnight UTC.
 * Formatting THAT in Manila would roll it forward a day, so the calendar date
 * is read with UTC accessors while clock times use the Manila formatter above.
 */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fmtDay(d: Date): string {
  // Same reason as fmtDate: pin to UTC noon so the weekday can't slip.
  return dayFmt.format(new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0,
  )))
}

export interface TimesheetExportRow {
  employeeNo:       string
  lastName:         string
  firstName:        string
  department:       string
  date:             Date
  timeIn:           Date | null
  breakOut:         Date | null
  breakIn:          Date | null
  timeOut:          Date | null
  regularHours:     number
  overtimeHours:    number
  nightDiffHours:   number
  lateMinutes:      number
  undertimeMinutes: number
  isRestDay:        boolean
  isHoliday:        boolean
  holidayType:      string | null
  isAbsent:         boolean
  isLeave:          boolean
  isHalfDay:        boolean
  source:           string
  approved:         boolean
  remarks:          string | null
}

export interface TimesheetExportOptions {
  companyName: string
  /** Human-readable range, e.g. "Aug 1 – Aug 31, 2026". Shown in the header. */
  periodLabel: string
  /** Mirrors the UI: when overtime pay is off, OT columns are omitted entirely. */
  includeOvertime: boolean
}

function statusOf(r: TimesheetExportRow): string {
  const flags: string[] = []
  if (r.isAbsent)  flags.push('Absent')
  if (r.isLeave)   flags.push('Leave')
  if (r.isHalfDay) flags.push('Half Day')
  if (r.isHoliday) flags.push(r.holidayType ? `Holiday (${r.holidayType})` : 'Holiday')
  if (r.isRestDay) flags.push('Rest Day')
  return flags.length ? flags.join(', ') : 'Present'
}

function detailHeader(includeOvertime: boolean): string[] {
  return [
    'Employee No', 'Last Name', 'First Name', 'Department',
    // breakIn is the START of the break and breakOut the END — the field names
    // read backwards, so use the labels the edit form already shows the user.
    'Date', 'Day', 'Time In', 'Break Start', 'Break End', 'Time Out',
    'Regular Hrs',
    ...(includeOvertime ? ['OT Hrs'] : []),
    'Night Diff Hrs', 'Late (min)', 'Undertime (min)',
    'Status', 'Source', 'Approved', 'Remarks',
  ]
}

function detailRow(r: TimesheetExportRow, includeOvertime: boolean): (string | number)[] {
  return [
    r.employeeNo, r.lastName, r.firstName, r.department,
    fmtDate(r.date), fmtDay(r.date),
    fmtTime(r.timeIn), fmtTime(r.breakIn), fmtTime(r.breakOut), fmtTime(r.timeOut),
    r.regularHours,
    ...(includeOvertime ? [r.overtimeHours] : []),
    r.nightDiffHours, r.lateMinutes, r.undertimeMinutes,
    statusOf(r), r.source, r.approved ? 'Yes' : 'No', r.remarks ?? '',
  ]
}

interface SummaryTotals {
  employeeNo: string
  name:       string
  department: string
  daysPresent:  number
  daysAbsent:   number
  daysOnLeave:  number
  regularHours: number
  overtimeHours: number
  nightDiffHours: number
  lateMinutes:  number
  undertimeMinutes: number
}

function summarise(rows: TimesheetExportRow[]): SummaryTotals[] {
  const map = new Map<string, SummaryTotals>()
  for (const r of rows) {
    const key = `${r.employeeNo}|${r.lastName}|${r.firstName}`
    let t = map.get(key)
    if (!t) {
      t = {
        employeeNo: r.employeeNo,
        name: `${r.lastName}, ${r.firstName}`,
        department: r.department,
        daysPresent: 0, daysAbsent: 0, daysOnLeave: 0,
        regularHours: 0, overtimeHours: 0, nightDiffHours: 0,
        lateMinutes: 0, undertimeMinutes: 0,
      }
      map.set(key, t)
    }
    if (r.isAbsent)      t.daysAbsent++
    else if (r.isLeave)  t.daysOnLeave++
    else                 t.daysPresent += r.isHalfDay ? 0.5 : 1
    t.regularHours     += r.regularHours
    t.overtimeHours    += r.overtimeHours
    t.nightDiffHours   += r.nightDiffHours
    t.lateMinutes      += r.lateMinutes
    t.undertimeMinutes += r.undertimeMinutes
  }
  const round2 = (n: number) => Math.round(n * 100) / 100
  return [...map.values()]
    .map(t => ({
      ...t,
      regularHours: round2(t.regularHours),
      overtimeHours: round2(t.overtimeHours),
      nightDiffHours: round2(t.nightDiffHours),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function generateTimesheetsExcel(
  rows: TimesheetExportRow[],
  opts: TimesheetExportOptions,
): ArrayBuffer {
  const { companyName, periodLabel, includeOvertime } = opts
  const wb = XLSX.utils.book_new()

  // ── Detail ────────────────────────────────────────────────────────────────
  const detail: (string | number)[][] = [
    [companyName],
    [`Timesheets — ${periodLabel}`],
    [`${rows.length} record${rows.length === 1 ? '' : 's'}`],
    [],
    detailHeader(includeOvertime),
    ...rows.map(r => detailRow(r, includeOvertime)),
  ]
  const wsDetail = XLSX.utils.aoa_to_sheet(detail)
  wsDetail['!cols'] = detailHeader(includeOvertime).map((h, i) => ({
    wch: i <= 3 ? Math.max(14, h.length + 2) : Math.max(10, h.length + 2),
  }))
  // Freeze the header block so scrolling a long export keeps the columns visible.
  wsDetail['!freeze'] = { xSplit: 0, ySplit: 5 }
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Timesheets')

  // ── Summary ───────────────────────────────────────────────────────────────
  const totals = summarise(rows)
  const summaryHeader = [
    'Employee No', 'Employee', 'Department',
    'Days Present', 'Days Absent', 'Days on Leave',
    'Regular Hrs',
    ...(includeOvertime ? ['OT Hrs'] : []),
    'Night Diff Hrs', 'Late (min)', 'Undertime (min)',
  ]
  const summary: (string | number)[][] = [
    [companyName],
    [`Summary — ${periodLabel}`],
    [],
    summaryHeader,
    ...totals.map(t => [
      t.employeeNo, t.name, t.department,
      t.daysPresent, t.daysAbsent, t.daysOnLeave,
      t.regularHours,
      ...(includeOvertime ? [t.overtimeHours] : []),
      t.nightDiffHours, t.lateMinutes, t.undertimeMinutes,
    ]),
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summary)
  wsSummary['!cols'] = summaryHeader.map(h => ({ wch: Math.max(12, h.length + 2) }))
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/** RFC 4180 quoting — a remark containing a comma or quote must not shift columns. */
function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function generateTimesheetsCsv(
  rows: TimesheetExportRow[],
  opts: TimesheetExportOptions,
): string {
  const lines = [
    detailHeader(opts.includeOvertime).map(csvCell).join(','),
    ...rows.map(r => detailRow(r, opts.includeOvertime).map(csvCell).join(',')),
  ]
  // BOM so Excel opens UTF-8 names (ñ, é) correctly instead of mojibake.
  return '﻿' + lines.join('\r\n')
}
