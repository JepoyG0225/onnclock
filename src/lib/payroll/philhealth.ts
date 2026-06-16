import { PHILHEALTH_2024 } from '../constants'

export function computePhilHealth(monthlySalary: number): {
  basis: number
  employeeShare: number
  employerShare: number
  total: number
} {
  const basis = Math.min(monthlySalary, PHILHEALTH_2024.MAX_SALARY)
  const totalPremium = Math.max(
    Math.round(basis * PHILHEALTH_2024.RATE * 100) / 100,
    PHILHEALTH_2024.MIN_PREMIUM_TOTAL
  )
  const share = parseFloat((totalPremium / 2).toFixed(2))

  return {
    basis,
    employeeShare: share,
    employerShare: share,
    total: totalPremium,
  }
}

/**
 * PhilHealth deduction per payroll period.
 *
 * Bracket is looked up against the actual monthly equivalent of what was
 * earned this period (so light periods land in lower brackets), then the
 * monthly contribution is split evenly across pay periods.
 */
export function getPhilHealthForPeriod(
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
  const { employeeShare, employerShare } = computePhilHealth(monthlyEquivalent)
  return {
    employee: parseFloat((employeeShare / divisor).toFixed(2)),
    employer: parseFloat((employerShare / divisor).toFixed(2)),
  }
}
