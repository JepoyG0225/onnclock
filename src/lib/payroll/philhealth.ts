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
 * - Monthly: full employee share
 * - Semi-monthly: half on each cutoff
 */
export function getPhilHealthForPeriod(
  monthlySalary: number,
  isFirstCutoff: boolean,
  payFrequency: 'SEMI_MONTHLY' | 'MONTHLY'
): { employee: number; employer: number } {
  const { employeeShare, employerShare } = computePhilHealth(monthlySalary)

  if (payFrequency === 'MONTHLY') {
    return { employee: employeeShare, employer: employerShare }
  }

  // Semi-monthly: split half each cutoff
  return {
    employee: parseFloat((employeeShare / 2).toFixed(2)),
    employer: parseFloat((employerShare / 2).toFixed(2)),
  }
}
