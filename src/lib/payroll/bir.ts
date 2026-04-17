import { BIR_ANNUAL_TAX_TABLE_2023 } from '../constants'

export function computeAnnualTax(annualTaxableIncome: number): number {
  if (annualTaxableIncome <= 0) return 0

  const bracket = BIR_ANNUAL_TAX_TABLE_2023.find(
    b => annualTaxableIncome >= b.from && annualTaxableIncome <= b.to
  )
  if (!bracket) return 0

  const tax = bracket.baseTax + (annualTaxableIncome - bracket.excessOver) * bracket.rate
  return Math.max(0, parseFloat(tax.toFixed(2)))
}

export interface WithholdingTaxInput {
  basicAndAllowances: number        // basic pay + regular allowances (taxable)
  overtimeAndPremium: number        // OT, holiday pay, night diff (taxable)
  deMinimisNonTaxable: number       // within BIR limits (non-taxable)
  additionalNonTaxable: number
  sssEmployee: number               // deducted from taxable base
  philhealthEmployee: number
  pagibigEmployee: number
  ytdWithholdingTax: number         // accumulated WH tax this year (before this period)
  payPeriodsInYear: number          // 12 (monthly) or 24 (semi-monthly)
  isExempt: boolean
  isMinimumWageEarner: boolean
}

export interface WithholdingTaxResult {
  taxableIncome: number
  nonTaxableIncome: number
  withholdingTax: number
  annualizedTaxable: number
  annualTax: number
}

/**
 * Compute withholding tax using BIR's Annualized Method.
 * BIR Revenue Regulation No. 2-98 as amended:
 * 1. Annualize the period's taxable income
 * 2. Compute annual tax from TRAIN Law table
 * 3. Divide by number of pay periods to get per-period tax
 */
export function computeWithholdingTax(input: WithholdingTaxInput): WithholdingTaxResult {
  if (input.isExempt || input.isMinimumWageEarner) {
    return {
      taxableIncome: 0,
      nonTaxableIncome: input.basicAndAllowances + input.overtimeAndPremium + input.deMinimisNonTaxable + input.additionalNonTaxable,
      withholdingTax: 0,
      annualizedTaxable: 0,
      annualTax: 0,
    }
  }

  // Government contributions reduce taxable income
  const govContributions = input.sssEmployee + input.philhealthEmployee + input.pagibigEmployee

  // Period taxable income = (basic + allowances + OT/premium) - gov contributions
  const periodTaxableIncome = Math.max(
    0,
    input.basicAndAllowances + input.overtimeAndPremium - govContributions
  )

  // Non-taxable = de minimis + gov contributions
  const nonTaxableIncome = input.deMinimisNonTaxable + input.additionalNonTaxable + govContributions

  // Annualize for bracket lookup
  const annualizedTaxable = periodTaxableIncome * input.payPeriodsInYear
  const annualTax = computeAnnualTax(annualizedTaxable)

  // Tax per period (annualized method)
  const taxPerPeriod = parseFloat((annualTax / input.payPeriodsInYear).toFixed(2))

  return {
    taxableIncome: parseFloat(periodTaxableIncome.toFixed(2)),
    nonTaxableIncome: parseFloat(nonTaxableIncome.toFixed(2)),
    withholdingTax: Math.max(0, taxPerPeriod),
    annualizedTaxable,
    annualTax,
  }
}
