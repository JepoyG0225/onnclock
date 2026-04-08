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
 * Night differential: +10% for each hour worked between 10pm–6am
 */
export function computeNightDifferential(hourlyRate: number, nightHours: number): number {
  if (nightHours <= 0) return 0
  return parseFloat((hourlyRate * OT_RATES.NIGHT_DIFFERENTIAL * nightHours).toFixed(2))
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
