/**
 * Single source of truth for timesheet hour math.
 *
 * Used by:
 *   - src/app/api/attendance/clock-out/route.ts
 *   - src/app/api/attendance/admin-action/route.ts
 *   - src/app/api/dtr/route.ts          (POST — admin manual create)
 *   - src/app/api/dtr/[id]/route.ts     (PATCH — admin manual edit)
 *
 * Every code path that mutates DTRRecord hour fields must go through here.
 * That guarantees:
 *   - regular hours are capped at the planned shift duration (not 8h)
 *   - night differential window (22:00–06:00 PHT) is computed minute-by-minute
 *   - late/undertime correctly normalize for overnight shifts
 *   - multi-shift days resolve to the assignment whose start time is closest
 *     to the actual clock-in (so a 20:00→04:00 DTR doesn't get matched to the
 *     04:00→12:00 assignment on the same date)
 */
import { differenceInMinutes } from 'date-fns'
import { prisma } from '@/lib/prisma'

const MAX_SHIFT_MINUTES = 24 * 60
const DEFAULT_REGULAR_CAP_MINUTES = 8 * 60

// ─── Time parsing helpers ───────────────────────────────────────────────────

export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function getManilaHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
}

export function getManilaMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return h * 60 + m
}

/**
 * Is the given Date inside the configured night-differential window (PHT)?
 *
 * The window is expressed as minutes-of-day, e.g. 22:00 = 1320 and 06:00 = 360.
 * When start > end (the typical graveyard pattern), the window wraps midnight:
 * a minute is "in" if it's at-or-after start OR before end. When start < end
 * (a daytime ND window — rare but possible), it must be both at-or-after start
 * AND before end. When start === end, the window is treated as inactive.
 */
function isInNightDiffWindow(date: Date, startMins: number, endMins: number): boolean {
  if (startMins === endMins) return false
  const phtMinutes = getManilaMinutes(date)
  if (startMins > endMins) {
    // wraps midnight (e.g. 22:00 → 06:00)
    return phtMinutes >= startMins || phtMinutes < endMins
  }
  // doesn't wrap (e.g. 00:00 → 06:00, or some hypothetical daytime ND)
  return phtMinutes >= startMins && phtMinutes < endMins
}

/**
 * Compute how many minutes of a planned shift fall inside the configured ND
 * window. Treats overnight shifts (out <= in) as next-day wrap. Returns null
 * when either end of the shift is missing — caller can then skip the cap.
 *
 *   plannedNdOverlapMinutes('23:00', '08:00', 22*60, 6*60) → 420 (7h, 23:00→06:00)
 *   plannedNdOverlapMinutes('09:00', '18:00', 22*60, 6*60) → 0   (no overlap)
 *   plannedNdOverlapMinutes('20:00', '04:00', 22*60, 6*60) → 360 (6h, 22:00→04:00)
 */
function plannedNdOverlapMinutes(
  schedIn: string | null | undefined,
  schedOut: string | null | undefined,
  ndStart: number,
  ndEnd: number,
): number | null {
  const inMins = parseTimeToMinutes(schedIn ?? null)
  const outMins = parseTimeToMinutes(schedOut ?? null)
  if (inMins == null || outMins == null) return null
  if (ndStart === ndEnd) return 0 // ND window disabled
  // Walk the planned shift minute-by-minute (treating overnight as wrap)
  // and count minutes that land in the ND window.
  const end = outMins > inMins ? outMins : outMins + 24 * 60
  let overlap = 0
  for (let cur = inMins; cur < end; cur++) {
    const m = cur % (24 * 60)
    if (ndStart > ndEnd) {
      if (m >= ndStart || m < ndEnd) overlap++
    } else {
      if (m >= ndStart && m < ndEnd) overlap++
    }
  }
  return overlap
}

/**
 * Convert a planned shift's "HH:MM" → "HH:MM" into total minutes, handling
 * overnight shifts (e.g. 20:00 → 12:00 next day = 16 hours).
 */
export function plannedShiftMinutes(
  timeInStr: string | null | undefined,
  timeOutStr: string | null | undefined,
): number | null {
  const a = parseTimeToMinutes(timeInStr)
  const b = parseTimeToMinutes(timeOutStr)
  if (a == null || b == null) return null
  let span = b - a
  if (span <= 0) span += 24 * 60
  return span
}

// ─── Hour calculation ───────────────────────────────────────────────────────

export interface ComputeHoursResult {
  regularHours: number
  overtimeHours: number
  nightDiffHours: number
}

/**
 * Compute regular / overtime / night-differential hours for a single shift.
 * Regular hours are capped at the planned shift duration so a 16h scheduled
 * shift counts the full 16h as regular instead of splitting at 8h.
 */
export function computeHours(
  timeIn: Date,
  timeOut: Date,
  breakIn: Date | null | undefined,
  breakOut: Date | null | undefined,
  opts: {
    plannedRegularMinutes?: number | null
    allowedBreakMinutes?: number
    /**
     * Per-company night-differential window in PHT minutes-of-day. Defaults
     * to 22:00 (1320) start, 06:00 (360) end. When start > end (the typical
     * graveyard pattern) the window wraps midnight.
     */
    nightDiffStartMins?: number
    nightDiffEndMins?: number
    /**
     * When TRUE, break minutes that fall inside the ND window still count
     * toward nightDiffHours (company policy: ND coverage applies to entire
     * stretch on premises). Default FALSE — break is excluded.
     */
    nightDiffIncludesBreak?: boolean
    /**
     * The planned shift's start/end as "HH:MM" strings. When provided, ND
     * hours are capped at the planned shift's overlap with the ND window —
     * so an employee clocking in early (e.g. 22:50 for a 23:00 shift) can't
     * pad ND. Pass nothing to skip the cap.
     */
    scheduledTimeIn?: string | null
    scheduledTimeOut?: string | null
  } = {},
): ComputeHoursResult {
  // Overnight rescue: when timeOut lands at or before timeIn the entry is
  // an overnight shift whose timeOut was stored on the same calendar day
  // as timeIn (UI date-defaulting / manual edits). Roll timeOut +24h so
  // the duration is positive — otherwise rawTotalMinutes goes negative,
  // gets clamped to 0, and silently zeros out reg/OT/ND for the row.
  const effectiveTimeOutRaw = timeOut.getTime() > timeIn.getTime()
    ? timeOut
    : new Date(timeOut.getTime() + 24 * 60 * 60 * 1000)
  const rawTotalMinutes = differenceInMinutes(effectiveTimeOutRaw, timeIn)
  const totalMinutes = Math.min(Math.max(0, rawTotalMinutes), MAX_SHIFT_MINUTES)
  const effectiveTimeOut = new Date(timeIn.getTime() + totalMinutes * 60_000)

  const allowed = opts.allowedBreakMinutes ?? 60
  const actualBreakMins =
    breakIn && breakOut
      ? Math.max(
          0,
          differenceInMinutes(
            breakOut > effectiveTimeOut ? effectiveTimeOut : breakOut,
            breakIn < timeIn ? timeIn : breakIn,
          ),
        )
      : 0
  // Only the allowed portion of break is deducted from worked time. Anything
  // beyond becomes tardiness via computeLateAndUndertime's break-late path.
  const effectiveBreak = Math.min(actualBreakMins, allowed)
  const workedMinutes = Math.max(0, totalMinutes - effectiveBreak)

  const cap = Math.max(
    1,
    Math.min(opts.plannedRegularMinutes ?? DEFAULT_REGULAR_CAP_MINUTES, MAX_SHIFT_MINUTES),
  )
  const regularMinutes = Math.min(workedMinutes, cap)
  const overtimeMinutes = Math.max(0, workedMinutes - cap)

  // Night differential: minute-by-minute walk through the actual shift window
  // counting only minutes that are (a) inside the configured ND window AND
  // (b) not inside the employee's break window. This automatically deducts:
  //   - Late clock-in        — walk starts at actual timeIn, not scheduled
  //   - Undertime / early-out — walk ends at actual timeOut (capped at MAX)
  //   - Allowed break         — skipped via the [breakIn, breakOut) check
  //   - Overbreak             — same break-skip catches overbreak minutes
  // So ND hours are always <= worked hours, with break + boundary minutes
  // properly excluded even if those minutes fall inside the ND window.
  const ndStart = opts.nightDiffStartMins ?? 22 * 60
  const ndEnd = opts.nightDiffEndMins ?? 6 * 60
  const ndIncludesBreak = opts.nightDiffIncludesBreak ?? false
  let nightDiffMinutes = 0
  let cursor = new Date(timeIn)
  while (cursor < effectiveTimeOut) {
    // Skip break minutes unless the company policy counts them toward ND.
    if (!ndIncludesBreak && breakIn && breakOut && cursor >= breakIn && cursor < breakOut) {
      cursor = new Date(cursor.getTime() + 60_000)
      continue
    }
    if (isInNightDiffWindow(cursor, ndStart, ndEnd)) nightDiffMinutes++
    cursor = new Date(cursor.getTime() + 60_000)
  }
  // Defensive cap — ND should never exceed the total stretch the employee
  // was on premises within the ND window. When break is included, that's
  // totalMinutes; when excluded, it's workedMinutes (totalMinutes - break).
  const ndCap = ndIncludesBreak ? totalMinutes : workedMinutes
  nightDiffMinutes = Math.min(nightDiffMinutes, ndCap)

  // Policy cap — when a planned shift is configured, ND is capped at the
  // shift's overlap with the ND window. Prevents early clock-ins from
  // padding ND. If no schedule is provided, no policy cap applies.
  const plannedNdOverlap = plannedNdOverlapMinutes(
    opts.scheduledTimeIn,
    opts.scheduledTimeOut,
    ndStart,
    ndEnd,
  )
  if (plannedNdOverlap != null) {
    nightDiffMinutes = Math.min(nightDiffMinutes, plannedNdOverlap)
  }

  // Final per-shift ceiling — 7 paid hours per standard 8h-1h-break shift.
  // Mirrors the same cap in src/app/api/payroll/[runId]/compute/route.ts so
  // both DTR writes (here) and payroll-time recomputation agree.
  nightDiffMinutes = Math.min(nightDiffMinutes, 7 * 60)

  return {
    regularHours: round2(regularMinutes / 60),
    overtimeHours: round2(overtimeMinutes / 60),
    nightDiffHours: round2(nightDiffMinutes / 60),
  }
}

// ─── Late / undertime ───────────────────────────────────────────────────────

export interface LateUndertimeResult {
  lateMinutes: number
  undertimeMinutes: number
}

/**
 * Compute late + undertime against a planned shift. Returns zeros when there
 * is no scheduled timeIn (employee is unscheduled — can't be late for nothing).
 * Handles overnight shifts where the actual clock-in might be the next morning.
 */
export function computeLateAndUndertime(
  timeIn: Date,
  timeOut: Date,
  scheduleTimeIn: string | null | undefined,
  scheduleTimeOut: string | null | undefined,
): LateUndertimeResult {
  const scheduledInMins = parseTimeToMinutes(scheduleTimeIn)
  if (scheduledInMins == null) return { lateMinutes: 0, undertimeMinutes: 0 }

  const scheduledOutMins = parseTimeToMinutes(scheduleTimeOut)
  const isOvernight = scheduledOutMins != null && scheduledOutMins <= scheduledInMins
  const actualInMins = getManilaMinutes(timeIn)
  const actualOutMins = getManilaMinutes(timeOut)

  // For overnight shifts: if the employee clocked in early-morning (before noon)
  // that's actually "the next calendar day" of the shift — add 24h before
  // comparing to the scheduled start.
  let normalizedInMins = actualInMins
  if (isOvernight && actualInMins < scheduledInMins && actualInMins < 12 * 60) {
    normalizedInMins = actualInMins + 24 * 60
  }
  const lateMinutes = Math.max(0, normalizedInMins - scheduledInMins)

  let undertimeMinutes = 0
  if (scheduledOutMins != null) {
    if (isOvernight) {
      if (actualOutMins < 12 * 60) {
        undertimeMinutes = Math.max(0, scheduledOutMins - actualOutMins)
      }
    } else {
      undertimeMinutes = Math.max(0, scheduledOutMins - actualOutMins)
    }
  }

  return { lateMinutes, undertimeMinutes }
}

// ─── Shift resolver (multi-shift safe) ──────────────────────────────────────

export interface ResolvedShift {
  scheduleTimeIn: string | null
  scheduleTimeOut: string | null
  allowedBreakMinutes: number
  /** Whether a per-date assignment was found (vs. falling back to fixed schedule) */
  matchedAssignment: boolean
}

/**
 * Resolve which shift a DTR record belongs to, multi-shift safe:
 *   1. If employee has a fixed workSchedule, start with those times.
 *   2. If there's a per-date EmployeeShiftAssignment, override.
 *   3. If multiple assignments exist for that date (multi-shift day), pick
 *      the one whose start time is closest to the actual clock-in (PHT,
 *      circular distance so 23:00 vs 01:00 = 2h, not 22h).
 *
 * Pass `actualTimeIn = null` if you don't have a clock-in yet (e.g. creating
 * an absent/rest-day record); the function will return the first assignment.
 */
export async function resolveShiftForDtr(params: {
  employeeId: string
  date: Date
  actualTimeIn: Date | null
  employee: {
    workScheduleId: string | null
    workSchedule: { timeIn: string | null; timeOut: string | null; breakMinutes: number | null } | null
  }
  defaultBreakMinutes?: number
}): Promise<ResolvedShift> {
  const { employeeId, date, actualTimeIn, employee, defaultBreakMinutes } = params

  let scheduleTimeIn: string | null = employee.workSchedule?.timeIn ?? null
  let scheduleTimeOut: string | null = employee.workSchedule?.timeOut ?? null
  let allowedBreakMinutes = normalizeBreakMinutes(
    employee.workSchedule?.breakMinutes ?? defaultBreakMinutes ?? 60,
  )
  let matchedAssignment = false

  // Look up per-date assignments (works for both fixed and flex employees:
  // a fixed-schedule employee can still have a per-day override).
  const assignments = await prisma.employeeShiftAssignment.findMany({
    where: { employeeId, date },
    select: {
      timeIn: true,
      timeOut: true,
      schedule: { select: { timeIn: true, timeOut: true, breakMinutes: true } },
    },
  })

  if (assignments.length > 0) {
    let chosen = assignments[0]
    if (assignments.length > 1 && actualTimeIn) {
      // Multi-shift day: pick the assignment closest to the actual clock-in.
      const actualPhtMins = getManilaMinutes(actualTimeIn)
      let bestDistance = Infinity
      for (const a of assignments) {
        const planMins = parseTimeToMinutes(a.timeIn ?? a.schedule?.timeIn ?? null)
        if (planMins == null) continue
        const raw = Math.abs(planMins - actualPhtMins)
        const dist = Math.min(raw, 24 * 60 - raw)
        if (dist < bestDistance) {
          bestDistance = dist
          chosen = a
        }
      }
    }
    scheduleTimeIn = chosen.timeIn ?? chosen.schedule?.timeIn ?? scheduleTimeIn
    scheduleTimeOut = chosen.timeOut ?? chosen.schedule?.timeOut ?? scheduleTimeOut
    if (chosen.schedule?.breakMinutes != null) {
      allowedBreakMinutes = normalizeBreakMinutes(chosen.schedule.breakMinutes)
    }
    matchedAssignment = true
  }

  return { scheduleTimeIn, scheduleTimeOut, allowedBreakMinutes, matchedAssignment }
}

// ─── Night-differential window ──────────────────────────────────────────────

/**
 * Load the company's configured night-differential window + break policy from
 * `PayrollCycleConfig`. Returns minutes-of-day for start + end plus an
 * `includesBreak` flag. Falls back to the legal default 22:00–06:00 (break
 * excluded) when the row is missing or the table doesn't exist yet.
 */
export async function getCompanyNightDiffWindow(
  companyId: string,
): Promise<{ startMins: number; endMins: number; includesBreak: boolean }> {
  const fallback = { startMins: 22 * 60, endMins: 6 * 60, includesBreak: false }
  try {
    const cfg = await prisma.payrollCycleConfig.findUnique({
      where: { companyId },
      select: {
        nightDifferentialStart: true,
        nightDifferentialEnd: true,
        nightDifferentialIncludesBreak: true,
      },
    })
    if (!cfg) return fallback
    const start = parseTimeToMinutes(cfg.nightDifferentialStart) ?? fallback.startMins
    const end = parseTimeToMinutes(cfg.nightDifferentialEnd) ?? fallback.endMins
    return { startMins: start, endMins: end, includesBreak: cfg.nightDifferentialIncludesBreak ?? false }
  } catch {
    return fallback
  }
}

// ─── Misc ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function normalizeBreakMinutes(v: number | null | undefined): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 60
  if (n > 240) return 240
  return Math.round(n)
}
