import { PAGIBIG_2024 } from '../constants'

// Pag-IBIG monthly contribution — HDMF Circular No. 460 (effective
// February 2024, still in force as of 2026).
//
//   MC ≤ ₱1,500 → EE 1%, ER 2%
//   MC > ₱1,500 → EE 2%, ER 2%
//   Monthly compensation ceiling: ₱10,000
//   Max contribution per share: ₱200/month
//
// Examples (post-cap):
//   MC ₱1,000  → EE  ₱10 (1%)   ER  ₱20 (2%)   → ₱30 total
//   MC ₱5,000  → EE ₱100 (2%)   ER ₱100 (2%)   → ₱200 total
//   MC ₱20,000 → EE ₱200 (cap)  ER ₱200 (cap)  → ₱400 total
export function computePagIBIG(monthlySalary: number): {
  employeeShare: number
  employerShare: number
  total: number
} {
  const cappedComp = Math.min(monthlySalary, 10_000) // policy salary ceiling
  const eeRate = cappedComp <= PAGIBIG_2024.THRESHOLD
    ? PAGIBIG_2024.EMPLOYEE_LOW_RATE   // 1% for low-MC tier
    : PAGIBIG_2024.EMPLOYEE_HIGH_RATE  // 2% for the rest
  const employeeShare = Math.min(
    parseFloat((cappedComp * eeRate).toFixed(2)),
    PAGIBIG_2024.MAX_EMPLOYEE,
  )
  const employerShare = Math.min(
    parseFloat((cappedComp * PAGIBIG_2024.EMPLOYER_RATE).toFixed(2)),
    PAGIBIG_2024.MAX_EMPLOYER,
  )
  return {
    employeeShare,
    employerShare,
    total: parseFloat((employeeShare + employerShare).toFixed(2)),
  }
}

/**
 * Pag-IBIG deduction per payroll period.
 *
 * Bracket is looked up against actual monthly equivalent earned this period,
 * then the monthly contribution is split evenly across pay periods.
 */
export function getPagIBIGForPeriod(
  actualEarnedThisPeriod: number,
  monthlyBasicFallback: number,
  payFrequency: 'SEMI_MONTHLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY',
  _isFirstCutoff?: boolean,
): { employee: number; employer: number } {
  const divisor = payFrequency === 'MONTHLY' ? 1
    : payFrequency === 'SEMI_MONTHLY' ? 2
    : payFrequency === 'WEEKLY' ? 4
    : 22
  const monthlyEquivalent = actualEarnedThisPeriod > 0
    ? actualEarnedThisPeriod * divisor
    : monthlyBasicFallback
  const { employeeShare, employerShare } = computePagIBIG(monthlyEquivalent)
  return {
    employee: parseFloat((employeeShare / divisor).toFixed(2)),
    employer: parseFloat((employerShare / divisor).toFixed(2)),
  }
}
