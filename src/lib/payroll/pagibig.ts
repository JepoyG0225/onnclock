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
 * - Monthly: full deduction
 * - Semi-monthly: full amount on 1st cutoff only
 */
export function getPagIBIGForPeriod(
  monthlySalary: number,
  isFirstCutoff: boolean,
  payFrequency: 'SEMI_MONTHLY' | 'MONTHLY'
): { employee: number; employer: number } {
  const { employeeShare, employerShare } = computePagIBIG(monthlySalary)

  if (payFrequency === 'MONTHLY') {
    return { employee: employeeShare, employer: employerShare }
  }

  if (isFirstCutoff) {
    return { employee: employeeShare, employer: employerShare }
  }

  return { employee: 0, employer: 0 }
}
