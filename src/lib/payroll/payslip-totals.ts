/** Stored payslip components. otherAllowances is a non-taxable subset of
 * otherEarnings, not an additional earning. SSS EC is employer-only. */
export const EARNING_FIELDS = [
  'basicSalary', 'regularOtAmount', 'restDayOtAmount', 'holidayOtAmount',
  'nightDiffAmount', 'holidayPayAmount', 'riceAllowance', 'clothingAllowance',
  'medicalAllowance', 'otherEarnings',
] as const
export const EMPLOYEE_DEDUCTION_FIELDS = [
  'sssEmployee', 'philhealthEmployee', 'pagibigEmployee', 'withholdingTax',
  'sssLoanDeduction', 'pagibigLoan', 'companyLoan', 'lateDeduction',
  'undertimeDeduction', 'absenceDeduction', 'otherDeductions',
] as const
type Components = Partial<Record<typeof EARNING_FIELDS[number] | typeof EMPLOYEE_DEDUCTION_FIELDS[number], number>>
export function payslipTotals(values: Components) {
  const total = (fields: readonly (keyof Components)[]) =>
    Number(fields.reduce((sum, key) => sum + (values[key] ?? 0), 0).toFixed(2))
  const grossPay = total(EARNING_FIELDS)
  const totalDeductions = total(EMPLOYEE_DEDUCTION_FIELDS)
  return { grossPay, totalDeductions, netPay: Number((grossPay - totalDeductions).toFixed(2)) }
}
