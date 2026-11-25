/** Monthly repayment split using the employee payroll frequency. */
export function employeePeriodDivisor(frequency?: string | null): number {
  return frequency === 'MONTHLY' ? 1 : frequency === 'WEEKLY' ? 52 / 12 : frequency === 'DAILY' ? 22 : 2
}
