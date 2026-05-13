import { PAGIBIG_2024 } from '../constants'

export function computePagIBIG(monthlySalary: number): {
  employeeShare: number
  employerShare: number
  total: number
} {
  const employeeRate = monthlySalary <= PAGIBIG_2024.THRESHOLD
    ? PAGIBIG_2024.EMPLOYEE_LOW_RATE
    : PAGIBIG_2024.EMPLOYEE_HIGH_RATE

  const employeeShare = Math.min(
    parseFloat((monthlySalary * employeeRate).toFixed(2)),
    PAGIBIG_2024.MAX_EMPLOYEE
  )
  const employerShare = Math.min(
    parseFloat((monthlySalary * PAGIBIG_2024.EMPLOYER_RATE).toFixed(2)),
    PAGIBIG_2024.MAX_EMPLOYER
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
