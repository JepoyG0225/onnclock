/**
 * Unified pay-rate derivation.
 *
 * Every rate type — MONTHLY, DAILY, HOURLY — is reduced here to the same
 * two primitives: an effective DAILY rate and an effective HOURLY rate.
 * Downstream code (overtime, night differential, holiday premiums, late /
 * undertime deductions) consumes those primitives and never has to branch
 * on rateType or hardcode an 8-hour day / 22-day month.
 *
 * Both divisors come from company setup rather than constants:
 *   workHoursPerDay      — the employee's work schedule
 *   workingDaysPerMonth  — the payroll cycle config (EMR divisor)
 *
 * Rates are derived from `basicSalary`, which is the single authoritative
 * figure on the Employee record. The stored `dailyRate` / `hourlyRate`
 * columns are only a fallback: they are snapshots written with hardcoded
 * 22/8 divisors at the time the employee was saved, so trusting them would
 * silently ignore the company's configured basis.
 */

export type RateType = 'MONTHLY' | 'DAILY' | 'HOURLY'

export interface RateBasis {
  /** Standard paid hours in one work day. */
  workHoursPerDay: number
  /** Scheduled work days in a month — the monthly → daily divisor. */
  workingDaysPerMonth: number
}

export interface RatedEmployee {
  basicSalary: number
  dailyRate: number
  hourlyRate: number
  rateType: RateType | string
}

/**
 * Fallbacks match the divisors this app hardcoded before the basis became
 * configurable, so an unconfigured company keeps its existing numbers.
 */
export const DEFAULT_WORK_HOURS_PER_DAY = 8
export const DEFAULT_WORKING_DAYS_PER_MONTH = 22

/** Coerce a partial or missing basis into a usable one, guarding against 0 and NaN. */
export function normalizeRateBasis(basis?: Partial<RateBasis> | null): RateBasis {
  const hours = Number(basis?.workHoursPerDay)
  const days = Number(basis?.workingDaysPerMonth)
  return {
    workHoursPerDay:
      Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_WORK_HOURS_PER_DAY,
    workingDaysPerMonth:
      Number.isFinite(days) && days > 0 ? days : DEFAULT_WORKING_DAYS_PER_MONTH,
  }
}

/**
 * Effective DAILY rate for any rate type.
 *
 *   DAILY   → basicSalary IS the daily rate
 *   HOURLY  → hourly × workHoursPerDay
 *   MONTHLY → monthly ÷ workingDaysPerMonth
 */
export function deriveDailyRate(employee: RatedEmployee, basis?: Partial<RateBasis> | null): number {
  const b = normalizeRateBasis(basis)
  const base = Number(employee.basicSalary)

  if (employee.rateType === 'DAILY') {
    return base > 0 ? base : Number(employee.dailyRate) || 0
  }

  if (employee.rateType === 'HOURLY') {
    const hourly = base > 0 ? base : Number(employee.hourlyRate) || 0
    return hourly * b.workHoursPerDay
  }

  // MONTHLY (and any unknown type, which we treat as monthly)
  if (base > 0) return base / b.workingDaysPerMonth
  return Number(employee.dailyRate) || 0
}

/**
 * Effective MONTHLY equivalent for any rate type — the inverse of
 * `deriveDailyRate`. Callers that price a whole month (separation pay,
 * "one month pay" minimums, final pay) need this: `basicSalary` only holds
 * a monthly figure for MONTHLY employees, so reading it directly prices a
 * DAILY employee's day rate as if it were their month.
 *
 *   MONTHLY → basicSalary as-is
 *   DAILY   → daily  × workingDaysPerMonth
 *   HOURLY  → hourly × workHoursPerDay × workingDaysPerMonth
 *
 * Pass the same `workingDaysPerMonth` the caller uses to convert back down
 * to a daily rate, so the round-trip is exact.
 */
export function deriveMonthlyEquivalent(employee: RatedEmployee, basis?: Partial<RateBasis> | null): number {
  const b = normalizeRateBasis(basis)

  if (employee.rateType === 'DAILY' || employee.rateType === 'HOURLY') {
    return deriveDailyRate(employee, b) * b.workingDaysPerMonth
  }

  // MONTHLY (and any unknown type, which we treat as monthly)
  const base = Number(employee.basicSalary)
  if (base > 0) return base
  return (Number(employee.dailyRate) || 0) * b.workingDaysPerMonth
}

/**
 * Effective HOURLY rate for any rate type — always
 * `effective daily rate ÷ workHoursPerDay`, which keeps the daily and
 * hourly views of the same salary consistent by construction.
 */
export function deriveHourlyRate(employee: RatedEmployee, basis?: Partial<RateBasis> | null): number {
  const b = normalizeRateBasis(basis)

  // HOURLY employees carry the hourly figure directly; going via the daily
  // rate would round-trip through workHoursPerDay for no reason.
  if (employee.rateType === 'HOURLY') {
    const base = Number(employee.basicSalary)
    return base > 0 ? base : Number(employee.hourlyRate) || 0
  }

  const daily = deriveDailyRate(employee, b)
  return daily / b.workHoursPerDay
}

/**
 * Per-MINUTE rate — the unit late and undertime minutes are charged at.
 *
 * For a MONTHLY employee this expands to exactly:
 *   monthlySalary ÷ workingDaysPerMonth ÷ workHoursPerDay ÷ 60
 */
export function deriveMinuteRate(employee: RatedEmployee, basis?: Partial<RateBasis> | null): number {
  return deriveHourlyRate(employee, basis) / 60
}

/** Round to centavos. Every money figure leaving the engine goes through this. */
export function money(value: number): number {
  return parseFloat(value.toFixed(2))
}
