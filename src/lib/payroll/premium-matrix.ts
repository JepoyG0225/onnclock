/**
 * Philippine premium-pay matrix + per-shift hour classifier.
 *
 * This is the single source of truth for splitting a worked shift into the
 * DOLE premium categories and pricing each one. It exists because night-shift
 * employees who cross midnight into a holiday must have their hours split by
 *   (a) the actual PHT calendar date each minute falls on  → holiday / rest-day
 *   (b) the night-differential window (default 22:00–06:00) → ND or not
 *   (c) the regular-hours cap                               → regular or OT
 * so a single shift can legitimately produce e.g. ORDINARY_ND (before midnight)
 * + RH_ND (LHND, 00:00–06:00 on the holiday) + RH (06:00–end on the holiday).
 *
 * The multipliers below are expressed as a fraction of the employee's BASE
 * hourly rate and are INCLUSIVE of the basic 100% for worked hours — i.e.
 * `pay(hour) = baseHourly × multiplier`. Night differential is the DOLE +10%
 * computed on the *applicable* hourly rate (so on a regular holiday it is
 * 10% × 200% = +20% of base), which is exactly the LHND case.
 *
 *   References: DOLE Handbook on Workers' Statutory Monetary Benefits, Ch. 4–7.
 */

export type DayClass = 'ORDINARY' | 'REST_DAY'
export type HolidayClass = 'NONE' | 'SPECIAL_NON_WORKING' | 'REGULAR'

/** All 24 premium categories produced by the classifier. */
export type PremiumCategory =
  | 'ORDINARY' | 'ORDINARY_ND' | 'ORDINARY_OT' | 'ORDINARY_OT_ND'
  | 'REST_DAY' | 'REST_DAY_ND' | 'REST_DAY_OT' | 'REST_DAY_OT_ND'
  | 'SPECIAL' | 'SPECIAL_ND' | 'SPECIAL_OT' | 'SPECIAL_OT_ND'
  | 'SPECIAL_RD' | 'SPECIAL_RD_ND' | 'SPECIAL_RD_OT' | 'SPECIAL_RD_OT_ND'
  | 'REGULAR_HOLIDAY' | 'REGULAR_HOLIDAY_ND' | 'REGULAR_HOLIDAY_OT' | 'REGULAR_HOLIDAY_OT_ND'
  | 'REGULAR_HOLIDAY_RD' | 'REGULAR_HOLIDAY_RD_ND' | 'REGULAR_HOLIDAY_RD_OT' | 'REGULAR_HOLIDAY_RD_OT_ND'

/**
 * Multiplier of BASE hourly rate, inclusive of the basic 100% (for the
 * non-OT categories) or the OT base (for the OT categories). ND adds 10% of
 * the applicable rate on top.
 *
 * Derivation per hour:
 *   base rate r (the non-ND, non-OT multiplier for that day/holiday class)
 *   ND  → r + 0.10·r
 *   OT  → r·1.25 family captured directly as the OT figure below
 *   OT+ND → otRate + 0.10·otRate
 */
export const PREMIUM_MULTIPLIERS: Record<PremiumCategory, number> = {
  // Ordinary working day
  ORDINARY: 1.0,
  ORDINARY_ND: 1.1,            // 1.00 + 10%
  ORDINARY_OT: 1.25,
  ORDINARY_OT_ND: 1.375,       // 1.25 + 10%

  // Rest day
  REST_DAY: 1.3,
  REST_DAY_ND: 1.43,           // 1.30 + 10%
  REST_DAY_OT: 1.69,
  REST_DAY_OT_ND: 1.859,       // 1.69 + 10%

  // Special non-working day
  SPECIAL: 1.3,
  SPECIAL_ND: 1.43,
  SPECIAL_OT: 1.69,
  SPECIAL_OT_ND: 1.859,

  // Special non-working day falling on a rest day
  SPECIAL_RD: 1.5,
  SPECIAL_RD_ND: 1.65,         // 1.50 + 10%
  SPECIAL_RD_OT: 1.95,
  SPECIAL_RD_OT_ND: 2.145,     // 1.95 + 10%

  // Regular (legal) holiday
  REGULAR_HOLIDAY: 2.0,
  REGULAR_HOLIDAY_ND: 2.2,     // 2.00 + (10% × 200%) = LHND
  REGULAR_HOLIDAY_OT: 2.6,
  REGULAR_HOLIDAY_OT_ND: 2.86, // 2.60 + 10%

  // Regular holiday falling on a rest day
  REGULAR_HOLIDAY_RD: 2.6,
  REGULAR_HOLIDAY_RD_ND: 2.86,
  REGULAR_HOLIDAY_RD_OT: 3.38,
  REGULAR_HOLIDAY_RD_OT_ND: 3.718,
}

/** Human-readable labels for payslip line items. */
export const PREMIUM_LABELS: Record<PremiumCategory, string> = {
  ORDINARY: 'Regular',
  ORDINARY_ND: 'Night Differential',
  ORDINARY_OT: 'Overtime',
  ORDINARY_OT_ND: 'Overtime (Night Diff)',
  REST_DAY: 'Rest Day',
  REST_DAY_ND: 'Rest Day (Night Diff)',
  REST_DAY_OT: 'Rest Day OT',
  REST_DAY_OT_ND: 'Rest Day OT (Night Diff)',
  SPECIAL: 'Special Holiday',
  SPECIAL_ND: 'Special Holiday (Night Diff)',
  SPECIAL_OT: 'Special Holiday OT',
  SPECIAL_OT_ND: 'Special Holiday OT (Night Diff)',
  SPECIAL_RD: 'Special Holiday (Rest Day)',
  SPECIAL_RD_ND: 'Special Holiday (Rest Day, Night Diff)',
  SPECIAL_RD_OT: 'Special Holiday OT (Rest Day)',
  SPECIAL_RD_OT_ND: 'Special Holiday OT (Rest Day, Night Diff)',
  REGULAR_HOLIDAY: 'Legal Holiday',
  REGULAR_HOLIDAY_ND: 'Legal Holiday (Night Diff)',
  REGULAR_HOLIDAY_OT: 'Legal Holiday OT',
  REGULAR_HOLIDAY_OT_ND: 'Legal Holiday OT (Night Diff)',
  REGULAR_HOLIDAY_RD: 'Legal Holiday (Rest Day)',
  REGULAR_HOLIDAY_RD_ND: 'Legal Holiday (Rest Day, Night Diff)',
  REGULAR_HOLIDAY_RD_OT: 'Legal Holiday OT (Rest Day)',
  REGULAR_HOLIDAY_RD_OT_ND: 'Legal Holiday OT (Rest Day, Night Diff)',
}

// ─── PHT helpers (TZ-independent) ────────────────────────────────────────────

/** Minute-of-day in Asia/Manila for a Date, regardless of server TZ. */
function phtMinuteOfDay(date: Date): number {
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes()
  return (utcMin + 8 * 60) % (24 * 60)
}

/** YYYY-MM-DD of a Date in Asia/Manila, regardless of server TZ. */
export function phtDateKey(date: Date): string {
  // Shift to PHT then read the UTC parts of the shifted instant.
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return shifted.toISOString().split('T')[0]
}

function inNdWindow(minOfDay: number, ndStart: number, ndEnd: number): boolean {
  if (ndStart === ndEnd) return false
  return ndStart > ndEnd
    ? minOfDay >= ndStart || minOfDay < ndEnd      // wraps midnight (22:00→06:00)
    : minOfDay >= ndStart && minOfDay < ndEnd
}

// ─── Category resolution ─────────────────────────────────────────────────────

function categoryFor(p: {
  holiday: HolidayClass
  isRestDay: boolean
  isNd: boolean
  isOt: boolean
}): PremiumCategory {
  const nd = p.isNd ? '_ND' : ''
  const ot = p.isOt ? '_OT' : ''
  if (p.holiday === 'REGULAR') {
    const rd = p.isRestDay ? '_RD' : ''
    return `REGULAR_HOLIDAY${rd}${ot}${nd}` as PremiumCategory
  }
  if (p.holiday === 'SPECIAL_NON_WORKING') {
    const rd = p.isRestDay ? '_RD' : ''
    return `SPECIAL${rd}${ot}${nd}` as PremiumCategory
  }
  if (p.isRestDay) return `REST_DAY${ot}${nd}` as PremiumCategory
  return `ORDINARY${ot}${nd}` as PremiumCategory
}

export interface ClassifyShiftInput {
  timeIn: Date
  timeOut: Date
  /** Break window to exclude from worked/paid minutes. */
  breakIn?: Date | null
  breakOut?: Date | null
  /** Used when breakIn/breakOut absent: deduct this many minutes (assumed mid-shift). */
  allowedBreakMinutes?: number
  /** Worked minutes up to this cap are "regular"; beyond it are OT. */
  regularCapMinutes: number
  /**
   * Stop classifying once this many PAID (worked, non-break) minutes are
   * counted. Used to drop unpaid overstay beyond regular + approved OT while
   * keeping the real shift timeline (and break) intact. Omit for no cap.
   */
  maxWorkedMinutes?: number
  /** ND window in PHT minutes-of-day. Defaults 22:00 / 06:00. */
  ndStartMins?: number
  ndEndMins?: number
  /** Per-date lookups (key = PHT YYYY-MM-DD). */
  holidayFor: (dateKey: string) => HolidayClass
  isRestDayDate: (dateKey: string) => boolean
}

export type CategoryHours = Partial<Record<PremiumCategory, number>>

/**
 * Walk a worked shift minute-by-minute and bucket each PAID minute into its
 * DOLE premium category. Overnight shifts (timeOut <= timeIn) are rolled +24h.
 * Break minutes are excluded. The first `regularCapMinutes` paid minutes are
 * "regular"; the remainder are OT.
 *
 * Returns hours (not minutes) per category, rounded to 2 decimals.
 */
export function classifyShiftHours(input: ClassifyShiftInput): CategoryHours {
  const ndStart = input.ndStartMins ?? 22 * 60
  const ndEnd = input.ndEndMins ?? 6 * 60

  const timeIn = input.timeIn
  let timeOut = input.timeOut
  if (timeOut.getTime() <= timeIn.getTime()) {
    timeOut = new Date(timeOut.getTime() + 24 * 60 * 60 * 1000)
  }

  // Resolve the break interval to skip. When explicit break clock events are
  // missing but a break is allowed, skip a block of `allowedBreakMinutes`
  // placed at the shift midpoint (a defensible default — its ND/holiday
  // classification rarely differs from surrounding minutes, and callers that
  // need exactness can pass real break timestamps).
  let breakStart: number | null = null // ms
  let breakEnd: number | null = null
  if (input.breakIn && input.breakOut && input.breakOut > input.breakIn) {
    breakStart = input.breakIn.getTime()
    breakEnd = input.breakOut.getTime()
  } else if ((input.allowedBreakMinutes ?? 0) > 0) {
    const totalMs = timeOut.getTime() - timeIn.getTime()
    const brk = (input.allowedBreakMinutes ?? 0) * 60_000
    if (brk < totalMs) {
      const mid = timeIn.getTime() + Math.floor((totalMs - brk) / 2)
      breakStart = mid
      breakEnd = mid + brk
    }
  }

  const buckets = new Map<PremiumCategory, number>()
  let workedMin = 0
  const cap = Math.max(0, input.regularCapMinutes)
  const maxWorked = input.maxWorkedMinutes != null ? Math.max(0, input.maxWorkedMinutes) : Infinity

  for (let t = timeIn.getTime(); t < timeOut.getTime(); t += 60_000) {
    if (workedMin >= maxWorked) break
    if (breakStart != null && breakEnd != null && t >= breakStart && t < breakEnd) continue
    const cur = new Date(t)
    const dateKey = phtDateKey(cur)
    const minOfDay = phtMinuteOfDay(cur)
    const isNd = inNdWindow(minOfDay, ndStart, ndEnd)
    const isOt = workedMin >= cap
    const cat = categoryFor({
      holiday: input.holidayFor(dateKey),
      isRestDay: input.isRestDayDate(dateKey),
      isNd,
      isOt,
    })
    buckets.set(cat, (buckets.get(cat) ?? 0) + 1)
    workedMin++
  }

  const out: CategoryHours = {}
  for (const [cat, mins] of buckets) {
    out[cat] = Math.round((mins / 60) * 100) / 100
  }
  return out
}

function isOtCategory(c: PremiumCategory): boolean {
  return c.includes('_OT')
}

/** Sibling category with the trailing _ND removed (for ND-increment math). */
function siblingWithoutNd(c: PremiumCategory): PremiumCategory {
  return (c.endsWith('_ND') ? c.slice(0, -3) : c) as PremiumCategory
}

/**
 * EARNING added to gross for one category's hours, i.e. the amount ON TOP of
 * the basic 100% the engine's basicPay already pays for worked regular hours.
 *
 *   non-OT → (multiplier − 1.0) × base × hours   (premium only)
 *   OT     →  multiplier        × base × hours   (full — OT hours are NOT in
 *                                                 basicPay/regularHours)
 */
export function categoryEarning(c: PremiumCategory, hours: number, baseHourly: number): number {
  const mult = PREMIUM_MULTIPLIERS[c]
  const factor = isOtCategory(c) ? mult : mult - 1.0
  return Math.round(baseHourly * hours * factor * 100) / 100
}

/** The pure night-differential increment within a category (0 when not _ND). */
function categoryNdIncrement(c: PremiumCategory, hours: number, baseHourly: number): number {
  if (!c.endsWith('_ND')) return 0
  const sib = siblingWithoutNd(c)
  return Math.round(baseHourly * hours * (PREMIUM_MULTIPLIERS[c] - PREMIUM_MULTIPLIERS[sib]) * 100) / 100
}

export interface PremiumLineItem {
  category: PremiumCategory
  label: string
  hours: number
  multiplier: number
  /** Earning added to gross (premium-only for non-OT, full for OT). */
  amount: number
}

/**
 * Itemized premium lines for persistence/display. Skips ORDINARY (pure basic,
 * amount 0) and any zero-hour category.
 */
export function premiumLineItems(hoursByCat: CategoryHours, baseHourly: number): PremiumLineItem[] {
  const out: PremiumLineItem[] = []
  for (const cat of Object.keys(hoursByCat) as PremiumCategory[]) {
    const hours = hoursByCat[cat] ?? 0
    if (hours <= 0) continue
    const amount = categoryEarning(cat, hours, baseHourly)
    if (amount === 0) continue // plain ORDINARY hours — already in basic pay
    out.push({ category: cat, label: PREMIUM_LABELS[cat], hours, multiplier: PREMIUM_MULTIPLIERS[cat], amount })
  }
  return out
}

export interface PremiumRollups {
  nightDiffAmount: number   // ALL ND increments (regular + holiday) — total
  holidayNdAmount: number   // ND increment on HOLIDAY hours only (the "Holiday ND")
  // regularNd = nightDiffAmount − holidayNdAmount (the "Regular ND")
  holidayPayAmount: number  // worked-holiday premium (excl. ND increment)
  holidayOtAmount: number   // holiday OT (excl. ND increment)
  regularOtAmount: number   // ordinary-day OT (excl. ND increment)
  restDayOtAmount: number   // rest-day premium + rest-day OT (excl. ND increment)
  totalPremium: number      // = sum of all the above = Σ categoryEarning
}

/**
 * Decompose the categories into the legacy Payslip aggregate columns. The ND
 * increment of every category is pulled into `nightDiffAmount`; the remaining
 * "base" earning of each category is routed to the column that best matches
 * its nature. The five buckets sum to the total premium (no money lost), so
 * grossPay stays identical whether derived from columns or from the itemized
 * line items.
 */
export function premiumRollups(hoursByCat: CategoryHours, baseHourly: number): PremiumRollups {
  let nightDiffAmount = 0, holidayNdAmount = 0, holidayPayAmount = 0, holidayOtAmount = 0, regularOtAmount = 0, restDayOtAmount = 0
  for (const cat of Object.keys(hoursByCat) as PremiumCategory[]) {
    const hours = hoursByCat[cat] ?? 0
    if (hours <= 0) continue
    const isHoliday = cat.startsWith('REGULAR_HOLIDAY') || cat.startsWith('SPECIAL')
    const nd = categoryNdIncrement(cat, hours, baseHourly)
    nightDiffAmount += nd
    if (isHoliday) holidayNdAmount += nd   // ND earned on a holiday → "Holiday ND"
    const base = categoryEarning(cat, hours, baseHourly) - nd
    if (base === 0) continue
    const isOt = isOtCategory(cat)
    if (isHoliday) {
      if (isOt) holidayOtAmount += base
      else holidayPayAmount += base
    } else if (cat.startsWith('REST_DAY')) {
      restDayOtAmount += base
    } else if (isOt) {
      regularOtAmount += base
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  nightDiffAmount = r2(nightDiffAmount)
  holidayNdAmount = r2(holidayNdAmount)
  holidayPayAmount = r2(holidayPayAmount)
  holidayOtAmount = r2(holidayOtAmount)
  regularOtAmount = r2(regularOtAmount)
  restDayOtAmount = r2(restDayOtAmount)
  return {
    nightDiffAmount, holidayNdAmount, holidayPayAmount, holidayOtAmount, regularOtAmount, restDayOtAmount,
    totalPremium: r2(nightDiffAmount + holidayPayAmount + holidayOtAmount + regularOtAmount + restDayOtAmount),
  }
}

export interface PricedPremium {
  category: PremiumCategory
  label: string
  hours: number
  multiplier: number
  amount: number
}

/**
 * Price classified category hours at the given base hourly rate. `amount` is
 * the FULL pay for those hours (multiplier is inclusive of the basic 100%).
 * Callers that already pay the basic 100% elsewhere should use
 * `premiumOnlyAmount` (amount minus the 100% base for non-OT worked hours) —
 * see splitBasicVsPremium below.
 */
export function priceShiftPremiums(hoursByCat: CategoryHours, baseHourly: number): PricedPremium[] {
  const rows: PricedPremium[] = []
  for (const cat of Object.keys(hoursByCat) as PremiumCategory[]) {
    const hours = hoursByCat[cat] ?? 0
    if (hours <= 0) continue
    const multiplier = PREMIUM_MULTIPLIERS[cat]
    rows.push({
      category: cat,
      label: PREMIUM_LABELS[cat],
      hours,
      multiplier,
      amount: Math.round(baseHourly * hours * multiplier * 100) / 100,
    })
  }
  return rows
}
