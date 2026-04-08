import { THIRTEENTH_MONTH } from '../constants'

export interface ThirteenthMonthInput {
  employeeId: string
  year: number
  /** Basic salary actually earned each month (array of up to 12 values) */
  monthlyBasicEarned: number[]
}

export interface ThirteenthMonthResult {
  totalBasicEarned: number
  thirteenthMonthPay: number
  taxExemptPortion: number
  taxablePortion: number
}

/**
 * Compute 13th Month Pay per RA 6686.
 * Amount = Total Basic Salary in the Calendar Year / 12
 * First ₱90,000 is tax-exempt (TRAIN Law).
 */
export function compute13thMonth(input: ThirteenthMonthInput): ThirteenthMonthResult {
  const totalBasicEarned = input.monthlyBasicEarned.reduce((sum, m) => sum + (m || 0), 0)
  const thirteenthMonthPay = parseFloat((totalBasicEarned / 12).toFixed(2))

  const taxExemptPortion = Math.min(thirteenthMonthPay, THIRTEENTH_MONTH.TAX_EXEMPT_LIMIT)
  const taxablePortion = Math.max(0, thirteenthMonthPay - THIRTEENTH_MONTH.TAX_EXEMPT_LIMIT)

  return {
    totalBasicEarned,
    thirteenthMonthPay,
    taxExemptPortion,
    taxablePortion,
  }
}

/**
 * Pro-rated 13th month for resigned/terminated employees.
 * Based on months/days actually served within the calendar year.
 */
export function computeProrated13thMonth(
  monthlySalary: number,
  monthsServed: number,
): ThirteenthMonthResult {
  const totalBasicEarned = monthlySalary * monthsServed
  const thirteenthMonthPay = parseFloat((totalBasicEarned / 12).toFixed(2))
  const taxExemptPortion = Math.min(thirteenthMonthPay, THIRTEENTH_MONTH.TAX_EXEMPT_LIMIT)
  const taxablePortion = Math.max(0, thirteenthMonthPay - THIRTEENTH_MONTH.TAX_EXEMPT_LIMIT)

  return { totalBasicEarned, thirteenthMonthPay, taxExemptPortion, taxablePortion }
}
