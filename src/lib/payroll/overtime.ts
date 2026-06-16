import { OT_RATES } from '../constants'

/**
 * Compute overtime pay based on type.
 * hourlyRate = dailyRate / 8
 */
export function computeOvertimePay(hourlyRate: number, hours: number, type: keyof typeof OT_RATES): number {
  if (hours <= 0) return 0
  return parseFloat((hourlyRate * hours * OT_RATES[type]).toFixed(2))
}

/**
 * Regular day overtime: basic + 25%
 * Worker earns their regular hour rate plus 25% premium.
 * Net additional = hourlyRate × 0.25 × hours (since basic is already counted)
 */
export function computeRegularOT(hourlyRate: number, hours: number): number {
  if (hours <= 0) return 0
  return parseFloat((hourlyRate * hours * OT_RATES.REGULAR_DAY_OT).toFixed(2))
}

/**
 * Rest day work: +30% on top of regular rate
 */
export function computeRestDayPay(hourlyRate: number, hours: number): number {
  if (hours <= 0) return 0
  return parseFloat((hourlyRate * hours * OT_RATES.REST_DAY).toFixed(2))
}

/**
 * Rest day overtime: worked on rest day + OT
 */
export function computeRestDayOT(hourlyRate: number, hours: number): number {
  if (hours <= 0) return 0
  return parseFloat((hourlyRate * hours * OT_RATES.REST_DAY_OT).toFixed(2))
}

/**
 * Holiday pay premium (ADDITIONAL amount on top of basic pay already included).
 * Regular holiday: worker gets 200% → additional is 100% of daily rate
 * Special holiday: worker gets 130% → additional is 30% of daily rate
 */
export function computeHolidayPayAdditional(
  dailyRate: number,
  days: number,
  holidayType: 'REGULAR' | 'SPECIAL_NON_WORKING'
): number {
  if (days <= 0) return 0
  // The "additional premium" only — basic pay is computed separately
  const additionalRate = holidayType === 'REGULAR'
    ? OT_RATES.REGULAR_HOLIDAY - 1   // 100% additional
    : OT_RATES.SPECIAL_HOLIDAY - 1   // 30% additional
  return parseFloat((dailyRate * additionalRate * days).toFixed(2))
}

/**
 * Night differential PREMIUM — the +10% added on top of the regular hourly
 * wage for each hour worked inside the configured ND window. Returned value
 * is the premium only, NOT the full night-shift wage:
 *
 *   premium = hourlyRate × rate × nightHours        (e.g. 10% of hourly × hours)
 *   effective night-shift hourly = hourlyRate × (1 + rate)   (= 110% by default)
 *
 * The 100% base portion is already accounted for in basicPay/regularHours
 * (employees are paid their full wage for those hours regardless of timing),
 * so this function deliberately returns just the premium delta to avoid
 * double-counting. The `rate` arg defaults to OT_RATES.NIGHT_DIFFERENTIAL
 * (0.10) but the engine forwards whatever the company configured.
 */
export function computeNightDifferential(hourlyRate: number, nightHours: number, rate: number = OT_RATES.NIGHT_DIFFERENTIAL): number {
  if (nightHours <= 0) return 0
  return parseFloat((hourlyRate * rate * nightHours).toFixed(2))
}

/**
 * Late deduction: per-minute rate based on daily rate
 */
export function computeLateDeduction(dailyRate: number, lateMinutes: number): number {
  if (lateMinutes <= 0) return 0
  const minuteRate = dailyRate / (8 * 60)  // 8 hours × 60 minutes
  return parseFloat((minuteRate * lateMinutes).toFixed(2))
}

/**
 * Undertime deduction (same as late — per-minute rate)
 */
export function computeUndertimeDeduction(dailyRate: number, undertimeMinutes: number): number {
  return computeLateDeduction(dailyRate, undertimeMinutes)
}

/**
 * Absence deduction: full daily rate per day absent (unpaid)
 */
export function computeAbsenceDeduction(dailyRate: number, absentDays: number): number {
  if (absentDays <= 0) return 0
  return parseFloat((dailyRate * absentDays).toFixed(2))
}
