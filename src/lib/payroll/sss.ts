import { SSS_2024 } from '../constants'

export interface SSSBracket {
  minSalary: number
  maxSalary: number
  msc: number
  employeeShare: number
  employerShare: number
  ec: number
  total: number
}

let cachedTable: SSSBracket[] | null = null

export function buildSSSTable(): SSSBracket[] {
  if (cachedTable) return cachedTable

  const table: SSSBracket[] = []

  // Below ₱4,250 → MSC ₱4,000
  const firstMsc = SSS_2024.MIN_MSC
  table.push({
    minSalary: 0,
    maxSalary: firstMsc + 249.99,
    msc: firstMsc,
    employeeShare: parseFloat((firstMsc * SSS_2024.EMPLOYEE_RATE).toFixed(2)),
    employerShare: parseFloat((firstMsc * SSS_2024.EMPLOYER_RATE).toFixed(2)),
    ec: SSS_2024.EC_LOW,
    total: parseFloat((firstMsc * (SSS_2024.EMPLOYEE_RATE + SSS_2024.EMPLOYER_RATE) + SSS_2024.EC_LOW).toFixed(2)),
  })

  // ₱4,250 to ₱29,749.99 → MSC steps of ₱500
  for (let msc = firstMsc + SSS_2024.MSC_STEP; msc < SSS_2024.MAX_MSC; msc += SSS_2024.MSC_STEP) {
    const minSalary = msc - (SSS_2024.MSC_STEP / 2 - 0.01)
    const maxSalary = msc + (SSS_2024.MSC_STEP / 2 - 0.01)
    const ec = msc < SSS_2024.EC_THRESHOLD_MSC ? SSS_2024.EC_LOW : SSS_2024.EC_HIGH
    table.push({
      minSalary,
      maxSalary,
      msc,
      employeeShare: parseFloat((msc * SSS_2024.EMPLOYEE_RATE).toFixed(2)),
      employerShare: parseFloat((msc * SSS_2024.EMPLOYER_RATE).toFixed(2)),
      ec,
      total: parseFloat((msc * (SSS_2024.EMPLOYEE_RATE + SSS_2024.EMPLOYER_RATE) + ec).toFixed(2)),
    })
  }

  // ₱29,750 and above → MSC ₱30,000
  const maxMsc = SSS_2024.MAX_MSC
  table.push({
    minSalary: SSS_2024.MAX_MSC - (SSS_2024.MSC_STEP / 2 - 0.01),
    maxSalary: Infinity,
    msc: maxMsc,
    employeeShare: parseFloat((maxMsc * SSS_2024.EMPLOYEE_RATE).toFixed(2)),
    employerShare: parseFloat((maxMsc * SSS_2024.EMPLOYER_RATE).toFixed(2)),
    ec: SSS_2024.EC_HIGH,
    total: parseFloat((maxMsc * (SSS_2024.EMPLOYEE_RATE + SSS_2024.EMPLOYER_RATE) + SSS_2024.EC_HIGH).toFixed(2)),
  })

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
  const bracket = table.find(b => monthlySalary >= b.minSalary && monthlySalary <= b.maxSalary)
    ?? table[table.length - 1]

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
