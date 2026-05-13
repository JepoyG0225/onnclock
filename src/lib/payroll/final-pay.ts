/**
 * Philippine Final Pay Calculator (DOLE Labor Advisory 06-20).
 *
 * Computes every component an employee is owed on separation:
 *   1. Unpaid wages          — from the last payslip's coverage end through
 *                              the last working day
 *   2. Pro-rated 13th-month  — RA 6686, prorated by months served in the
 *                              calendar year (first ₱90k is tax-exempt)
 *   3. SIL cash conversion   — unused service incentive leave × daily rate
 *   4. Separation pay        — Labor Code Art. 298 (authorized causes)
 *                              or Art. 302 (retirement). Tax-exempt under
 *                              NIRC Sec 32(B)(6)(b) when involuntary.
 *   5. Other earnings        — refundable deposits, contractual bonuses
 *   6. Less outstanding loans + advances + unreturned-asset value
 *
 * DOLE requires final pay to be released within 30 days of separation
 * unless a longer period is provided in a CBA or company policy.
 *
 * IMPORTANT: This is a planning tool. The actual final pay run still
 * needs to flow through a regular payroll cycle so the WHT and benefits
 * line up in BIR 1601C / Alphalist. Treat the breakdown here as the
 * authoritative offboarding number; payroll automation can pick it up
 * later.
 */

import { computeAnnualTax } from './bir'

export type SeparationReason =
  | 'RESIGNATION'
  | 'TERMINATION_JUST_CAUSE'      // Art. 297 — serious misconduct, etc. — no separation pay
  | 'TERMINATION_AUTHORIZED'      // Art. 298 — installation of labor-saving devices, redundancy, retrenchment, closure
  | 'REDUNDANCY'                  // Art. 298(b)
  | 'RETRENCHMENT'                // Art. 298(c) — closure due to losses
  | 'CLOSURE_NO_LOSSES'           // Art. 298(d) — closure not due to losses
  | 'DISEASE'                     // Art. 299 — incurable disease
  | 'RETIREMENT'                  // Art. 302 — voluntary retirement (or 60+ with 5+ yrs)
  | 'END_OF_CONTRACT'             // project/fixed-term — generally no separation pay

export interface FinalPayInput {
  employeeId: string
  monthlySalary: number
  hireDate: Date
  lastWorkingDay: Date
  reason: SeparationReason

  /** Already-paid 13th month earlier in the year (₱). Defaults to 0. */
  thirteenthMonthAlreadyPaid?: number
  /** Cumulative basic salary actually earned in the year-to-date (₱). */
  basicEarnedYTD?: number

  /** Days of unused leave eligible for cash conversion. */
  unusedLeaveDays?: number

  /** Days worked since last cutoff that have not yet been paid. */
  unpaidWorkedDays?: number

  /** Tax already withheld YTD on regular compensation. */
  taxWithheldYTD?: number

  /** Annual taxable income YTD before this final-pay run. */
  taxableIncomeYTD?: number

  /** Outstanding loan balance (deducted from final pay). */
  outstandingLoans?: number

  /** Cash advances / overpayments to recover. */
  cashAdvanceBalance?: number

  /** Misc. additional taxable earnings (commission, bonus, etc.). */
  additionalTaxableEarnings?: number

  /** Misc. non-taxable additional earnings (allowance refunds, etc.). */
  additionalNonTaxableEarnings?: number

  /** Per-day cost of unreturned company property. */
  unreturnedAssetsCost?: number
}

export interface FinalPayComponent {
  key: string
  label: string
  amount: number
  taxable: boolean
  /** A short note shown to HR explaining the line item. */
  note?: string
}

export interface FinalPayResult {
  reason: SeparationReason
  yearsOfService: number
  monthsServedThisYear: number
  dailyRate: number

  components: FinalPayComponent[]

  // Aggregates
  grossPay: number
  taxableEarnings: number
  nonTaxableEarnings: number
  separationPay: number
  separationPayTaxExempt: boolean

  // Deductions
  totalDeductions: number
  taxWithheld: number

  // Net result
  netFinalPay: number
}

const DAYS_PER_MONTH = 26   // SC / DOLE convention for daily-rate divisor on monthly employees

function asDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d)
}

function monthsBetween(from: Date, to: Date): number {
  const start = asDate(from)
  const end   = asDate(to)
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  // Pro-rate the partial month so a Nov 15 separation counts as ~10.5 months
  const daysInLastMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
  months += (end.getDate() - start.getDate()) / daysInLastMonth
  return Math.max(0, parseFloat(months.toFixed(4)))
}

/**
 * Years of service (decimal). Used for separation-pay multipliers.
 * DOLE rule: a fraction of at least 6 months counts as one whole year.
 */
function yearsOfService(hireDate: Date, lastDay: Date): number {
  const months = monthsBetween(hireDate, lastDay)
  const wholeYears   = Math.floor(months / 12)
  const monthsExtra  = months - wholeYears * 12
  const bonusYear    = monthsExtra >= 6 ? 1 : 0
  return wholeYears + bonusYear
}

function separationPayMonthsFor(reason: SeparationReason): {
  // multiplier per year of service; the rule is "or one month, whichever is higher"
  monthsPerYear: number
  minMonths: number
  taxExempt: boolean
  basis: string
} | null {
  switch (reason) {
    case 'TERMINATION_AUTHORIZED':
    case 'REDUNDANCY':
    case 'CLOSURE_NO_LOSSES':
      // 1 month pay or 1 month per year of service, whichever is higher
      return { monthsPerYear: 1, minMonths: 1, taxExempt: true, basis: 'Labor Code Art. 298 (involuntary) — NIRC Sec 32(B)(6)(b) tax-exempt' }
    case 'RETRENCHMENT':
    case 'DISEASE':
      // 1/2 month pay or 1/2 month per year of service, whichever is higher, minimum 1 month
      return { monthsPerYear: 0.5, minMonths: 1, taxExempt: true, basis: 'Labor Code Art. 298(c)/299 — NIRC Sec 32(B)(6)(b) tax-exempt' }
    case 'RETIREMENT':
      // RA 7641: 22.5 days × years of service for qualified retirees (60+, 5+ years)
      // Simplified to 1/2 month per year of service here. Tax-exempt up to ₱10M lifetime.
      return { monthsPerYear: 0.5, minMonths: 0, taxExempt: true, basis: 'RA 7641 / Labor Code Art. 302 — tax-exempt under NIRC Sec 32(B)(6)(a)' }
    case 'RESIGNATION':
    case 'TERMINATION_JUST_CAUSE':
    case 'END_OF_CONTRACT':
      return null
  }
}

export function computeFinalPay(input: FinalPayInput): FinalPayResult {
  const lastDay   = asDate(input.lastWorkingDay)
  const hireDate  = asDate(input.hireDate)
  const yearStart = new Date(lastDay.getFullYear(), 0, 1)

  // Daily rate from monthly salary using DOLE 26-day divisor
  const dailyRate = parseFloat((input.monthlySalary / DAYS_PER_MONTH).toFixed(2))

  // Months served in the calendar year (Jan 1 of the separation year → last working day)
  const startOfService = hireDate > yearStart ? hireDate : yearStart
  const monthsServedThisYear = monthsBetween(startOfService, lastDay)
  const yos = yearsOfService(hireDate, lastDay)

  const components: FinalPayComponent[] = []

  // 1. Unpaid wages for any days worked after the last cutoff
  const unpaidWorkedDays = input.unpaidWorkedDays ?? 0
  if (unpaidWorkedDays > 0) {
    components.push({
      key: 'unpaidWages',
      label: 'Unpaid wages (post-cutoff)',
      amount: parseFloat((dailyRate * unpaidWorkedDays).toFixed(2)),
      taxable: true,
      note: `${unpaidWorkedDays} day${unpaidWorkedDays === 1 ? '' : 's'} at ₱${dailyRate.toFixed(2)}/day`,
    })
  }

  // 2. Pro-rated 13th-month pay (RA 6686)
  // Total basic earned in the year ÷ 12, minus what was already released.
  const basicEarnedYTD     = input.basicEarnedYTD ?? (input.monthlySalary * monthsServedThisYear)
  const proratedThirteenth = parseFloat((basicEarnedYTD / 12).toFixed(2))
  const thirteenthRemaining = Math.max(0, parseFloat(
    (proratedThirteenth - (input.thirteenthMonthAlreadyPaid ?? 0)).toFixed(2),
  ))
  if (thirteenthRemaining > 0) {
    components.push({
      key: 'thirteenthMonth',
      label: 'Pro-rated 13th-month pay',
      amount: thirteenthRemaining,
      taxable: false,  // first ₱90k exempt; we partition below in tax calc
      note: `Total earned ₱${basicEarnedYTD.toLocaleString('en-PH', { minimumFractionDigits: 2 })} ÷ 12 = ₱${proratedThirteenth.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
    })
  }

  // 3. SIL cash conversion (Labor Code Art. 95)
  const sil = input.unusedLeaveDays ?? 0
  if (sil > 0) {
    components.push({
      key: 'silConversion',
      label: 'Unused leave conversion',
      amount: parseFloat((dailyRate * sil).toFixed(2)),
      taxable: true,
      note: `${sil} day${sil === 1 ? '' : 's'} × ₱${dailyRate.toFixed(2)}/day`,
    })
  }

  // 4. Separation pay
  const sepRule = separationPayMonthsFor(input.reason)
  let separationPay = 0
  let separationPayTaxExempt = false
  if (sepRule) {
    const byYears = sepRule.monthsPerYear * yos * input.monthlySalary
    const min     = sepRule.minMonths * input.monthlySalary
    separationPay = parseFloat(Math.max(byYears, min).toFixed(2))
    separationPayTaxExempt = sepRule.taxExempt
    if (separationPay > 0) {
      components.push({
        key: 'separationPay',
        label: sepRule.taxExempt ? 'Separation pay (tax-exempt)' : 'Separation pay',
        amount: separationPay,
        taxable: !sepRule.taxExempt,
        note: `${sepRule.monthsPerYear} mo × ${yos} yr × ₱${input.monthlySalary.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (or min ${sepRule.minMonths} mo, whichever higher) — ${sepRule.basis}`,
      })
    }
  }

  // 5. Additional earnings
  if ((input.additionalTaxableEarnings ?? 0) > 0) {
    components.push({
      key: 'additionalTaxable',
      label: 'Additional taxable earnings',
      amount: parseFloat((input.additionalTaxableEarnings ?? 0).toFixed(2)),
      taxable: true,
      note: 'Commission, contractual bonuses, etc.',
    })
  }
  if ((input.additionalNonTaxableEarnings ?? 0) > 0) {
    components.push({
      key: 'additionalNonTaxable',
      label: 'Additional non-taxable earnings',
      amount: parseFloat((input.additionalNonTaxableEarnings ?? 0).toFixed(2)),
      taxable: false,
      note: 'Refunds, deposits returned, etc.',
    })
  }

  // ── Aggregates ──
  const grossPay         = parseFloat(components.reduce((s, c) => s + c.amount, 0).toFixed(2))
  const taxableEarnings  = parseFloat(components.filter(c => c.taxable).reduce((s, c) => s + c.amount, 0).toFixed(2))

  // 13th-month: first ₱90k tax-exempt; excess taxable
  const thirteenthTaxable = Math.max(0, proratedThirteenth - 90_000)
  const thirteenthExempt  = thirteenthRemaining - thirteenthTaxable

  // Final taxable for the period = taxable earnings + 13th-month excess
  // We then add YTD taxable to look up the annual tax owed, then subtract YTD withholding.
  const periodTaxable     = parseFloat((taxableEarnings + thirteenthTaxable).toFixed(2))
  const annualTaxableNow  = (input.taxableIncomeYTD ?? 0) + periodTaxable
  const annualTaxOwed     = computeAnnualTax(annualTaxableNow)
  const taxStillDue       = Math.max(0, parseFloat(
    (annualTaxOwed - (input.taxWithheldYTD ?? 0)).toFixed(2),
  ))

  const nonTaxableEarnings = parseFloat((grossPay - periodTaxable).toFixed(2))

  // Deductions
  const deductionLines: number[] = []
  if ((input.outstandingLoans ?? 0) > 0)    deductionLines.push(input.outstandingLoans ?? 0)
  if ((input.cashAdvanceBalance ?? 0) > 0)  deductionLines.push(input.cashAdvanceBalance ?? 0)
  if ((input.unreturnedAssetsCost ?? 0) > 0) deductionLines.push(input.unreturnedAssetsCost ?? 0)
  const totalDeductions = parseFloat(deductionLines.reduce((s, n) => s + n, 0).toFixed(2))

  const netFinalPay = parseFloat((grossPay - taxStillDue - totalDeductions + thirteenthExempt - thirteenthRemaining).toFixed(2))
  //
  // ↑ The exempt 13th portion was included in grossPay (correctly) but should
  // not contribute to taxableEarnings; the `thirteenthExempt - thirteenthRemaining`
  // cancels itself out and only the taxable excess gets taxed. We keep gross =
  // sum of components for clarity in the breakdown UI.

  return {
    reason: input.reason,
    yearsOfService: yos,
    monthsServedThisYear: parseFloat(monthsServedThisYear.toFixed(2)),
    dailyRate,
    components,
    grossPay,
    taxableEarnings: periodTaxable,
    nonTaxableEarnings,
    separationPay,
    separationPayTaxExempt,
    totalDeductions,
    taxWithheld: taxStillDue,
    netFinalPay: parseFloat((grossPay - taxStillDue - totalDeductions).toFixed(2)),
  }
}
