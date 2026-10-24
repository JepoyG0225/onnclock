import { SSS_2025 } from '../constants'

export interface SSSBracket {
  /** Inclusive lower bound of the compensation range. */
  salaryFrom: number
  /**
   * EXCLUSIVE upper bound — `Infinity` on the top bracket.
   *
   * Exclusive on purpose. The previous version used an inclusive bound of
   * `msc + 249.99`, with the next bracket starting at `msc + 250.01`, which
   * left a one-centavo hole at every ₱500 boundary: ₱5,250.00, ₱5,750.00,
   * ₱6,250.00 and so on — 60 such values between ₱0 and ₱40,000. A salary
   * landing exactly on one matched no bracket, and the `?? last` fallback
   * then charged it the TOP bracket. An employee earning ₱5,250.00 was
   * deducted ₱1,750.00 instead of ₱275.00.
   *
   * Half-open ranges make the table contiguous by construction and match
   * how SSS publishes it ("₱5,250 to ₱5,749.99 → MSC ₱5,500").
   */
  salaryToExclusive: number
  msc: number
  employeeShare: number
  employerShare: number
  ec: number
  total: number
}

let cachedTable: SSSBracket[] | null = null

function makeBracket(msc: number, salaryFrom: number, salaryToExclusive: number): SSSBracket {
  const ec = msc < SSS_2025.EC_THRESHOLD_MSC ? SSS_2025.EC_LOW : SSS_2025.EC_HIGH
  return {
    salaryFrom,
    salaryToExclusive,
    msc,
    employeeShare: round2(msc * SSS_2025.EMPLOYEE_RATE),
    employerShare: round2(msc * SSS_2025.EMPLOYER_RATE),
    ec,
    total: round2(msc * (SSS_2025.EMPLOYEE_RATE + SSS_2025.EMPLOYER_RATE) + ec),
  }
}

export function buildSSSTable(): SSSBracket[] {
  if (cachedTable) return cachedTable

  const { MIN_MSC, MAX_MSC, MSC_STEP } = SSS_2025
  const half = MSC_STEP / 2

  // [0, 5,250) → MSC ₱5,000
  const table: SSSBracket[] = [makeBracket(MIN_MSC, 0, MIN_MSC + half)]

  // [msc − 250, msc + 250) → that MSC, in ₱500 steps up to ₱34,500
  for (let msc = MIN_MSC + MSC_STEP; msc < MAX_MSC; msc += MSC_STEP) {
    table.push(makeBracket(msc, msc - half, msc + half))
  }

  // [34,750, ∞) → MSC ₱35,000
  table.push(makeBracket(MAX_MSC, MAX_MSC - half, Infinity))

  cachedTable = table
  return table
}

export function computeSSS(monthlySalary: number): {
  msc: number
  employeeShare: number
  employerShare: number
  ec: number
  total: number
} {
  const table = buildSSSTable()
  // Ranges are contiguous, so the only inputs that can miss are NaN or a
  // negative salary. Those fall to the MINIMUM bracket — the old fallback
  // was the maximum, which turned bad input into a maximal deduction.
  const bracket = monthlySalary > 0
    ? table.find(b => monthlySalary >= b.salaryFrom && monthlySalary < b.salaryToExclusive) ?? table[0]
    : table[0]

  return {
    msc: bracket.msc,
    employeeShare: bracket.employeeShare,
    employerShare: bracket.employerShare,
    ec: bracket.ec,
    total: bracket.total,
  }
}

/**
 * Periods-per-month for splitting monthly contributions into per-pay-period
 * amounts. Weekly uses 4 (not 4.33) by convention — small over-deduction in
 * 4-week months evens out across the year.
 */
export function periodsPerMonth(payFrequency: 'SEMI_MONTHLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY'): number {
  switch (payFrequency) {
    case 'MONTHLY': return 1
    case 'SEMI_MONTHLY': return 2
    case 'WEEKLY': return 4
    case 'DAILY': return 22  // typical working-days/month
  }
}

/**
 * SSS deduction per payroll period.
 *
 *   - The bracket is looked up against the MONTHLY EQUIVALENT of what the
 *     employee actually earned this period — so an employee with a light
 *     period (absences, partial month) lands in a lower bracket instead of
 *     paying the full monthly contribution off their basic-salary record.
 *   - The result is then SPLIT EVENLY across the periods in a month:
 *     Monthly = 1×, Semi-monthly = ½×, Weekly = ¼×, Daily = 1/22×.
 *
 * `actualEarnedThisPeriod` is the basic pay actually earned for this period
 * (after late/UT/absence deductions). Falls back to `monthlyBasicFallback`
 * when 0 (e.g., zero-pay period — keep the bracket fair).
 */
export function getSSSForPeriod(
  actualEarnedThisPeriod: number,
  monthlyBasicFallback: number,
  payFrequency: 'SEMI_MONTHLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY',
  // kept for backwards-call-site compat but no longer used (was: first-cutoff-takes-all)
  _isFirstCutoff?: boolean,
): { employee: number; employer: number; ec: number } {
  const divisor = periodsPerMonth(payFrequency)
  const monthlyEquivalent = actualEarnedThisPeriod > 0
    ? actualEarnedThisPeriod * divisor
    : monthlyBasicFallback
  const m = computeSSS(monthlyEquivalent)
  return {
    employee: round2(m.employeeShare / divisor),
    employer: round2(m.employerShare / divisor),
    ec: round2(m.ec / divisor),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
