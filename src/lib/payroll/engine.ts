import { PayrollInput, PayrollResult } from './types'
import { getSSSForPeriod } from './sss'
import { getPhilHealthForPeriod } from './philhealth'
import { getPagIBIGForPeriod } from './pagibig'
import { computeWithholdingTax } from './bir'
import {
  computeHolidayPayAdditional,
  computeNightDifferential,
  computeAbsenceDeduction,
} from './overtime'

/**
 * Master payroll computation engine.
 * Orchestrates all Philippine payroll rules in the correct order.
 */
export function computePayroll(input: PayrollInput): PayrollResult {
  const { employee, period, attendance, loans, deMinimis, allowances, ytd } = input
  const regularOtRate = period.regularOtRate ?? 1.25
  const restDayOtRate = period.restDayOtRate ?? 1.69
  const regularHolidayOtRate = period.regularHolidayOtRate ?? 2.6
  const specialHolidayOtRate = period.specialHolidayOtRate ?? 1.69

  const payPeriodsInYear = period.payFrequency === 'MONTHLY' ? 12 : 24

  // ── 1. BASIC PAY ─────────────────────────────
  const basicPay = computeBasicPay(
    employee.basicSalary,
    employee.rateType,
    attendance.daysWorked,
    period.workingDays,
    period.payFrequency
  )

  // If basic pay is zero, zero out all earnings/deductions for the period.
  if (basicPay === 0) {
    return {
      basicPay: 0,
      regularOtAmount: 0,
      restDayOtAmount: 0,
      holidayOtAmount: 0,
      nightDiffAmount: 0,
      holidayPayAmount: 0,
      allowancesTotal: 0,
      deMinimisTotal: 0,
      otherEarnings: 0,
      grossPay: 0,
      sssEmployee: 0,
      sssEc: 0,
      philhealthEmployee: 0,
      pagibigEmployee: 0,
      sssEmployer: 0,
      philhealthEmployer: 0,
      pagibigEmployer: 0,
      taxableIncome: 0,
      nonTaxableIncome: 0,
      withholdingTax: 0,
      lateDeduction: 0,
      undertimeDeduction: 0,
      absenceDeduction: 0,
      loanDeductions: 0,
      otherDeductions: 0,
      totalDeductions: 0,
      netPay: 0,
      thirteenthMonthContribution: 0,
      ytdGrossPay: ytd.grossPay,
      ytdTaxableIncome: ytd.taxableIncome,
      ytdWithholdingTax: ytd.withholdingTax,
    }
  }

  // ── 2. OVERTIME & PREMIUM PAY ─────────────────
  const hourlyRate = employee.hourlyRate > 0 ? employee.hourlyRate : employee.dailyRate / 8

  const regularOtAmount = parseFloat((hourlyRate * attendance.regularOtHours * regularOtRate).toFixed(2))
  const restDayOtAmount = parseFloat((hourlyRate * attendance.restDayOtHours * restDayOtRate).toFixed(2))

  // Holiday OT: total of regular holiday OT + special holiday OT
  const regularHolidayOt = attendance.regularHolidayOtHours > 0
    ? parseFloat((hourlyRate * attendance.regularHolidayOtHours * regularHolidayOtRate).toFixed(2))
    : 0
  const specialHolidayOt = attendance.specialHolidayOtHours > 0
    ? parseFloat((hourlyRate * attendance.specialHolidayOtHours * specialHolidayOtRate).toFixed(2))
    : 0
  const holidayOtAmount = regularHolidayOt + specialHolidayOt

  const nightDiffAmount = computeNightDifferential(hourlyRate, attendance.nightDiffHours, period.nightDifferentialRate)

  // Holiday pay premium (additional on top of basic)
  const regularHolidayPremium = computeHolidayPayAdditional(
    employee.dailyRate, attendance.regularHolidaysWorked, 'REGULAR'
  )
  const specialHolidayPremium = computeHolidayPayAdditional(
    employee.dailyRate, attendance.specialHolidaysWorked, 'SPECIAL_NON_WORKING'
  )
  const holidayPayAmount = regularHolidayPremium + specialHolidayPremium

  // Regular holiday non-work pay for daily/hourly rate employees
  // (They get 100% daily rate even on holidays they don't work - Art. 94 Labor Code)
  const regularHolidayNonWorkPay = attendance.regularHolidayNonWorkDays
    ? parseFloat((employee.dailyRate * (attendance.regularHolidayNonWorkDays ?? 0)).toFixed(2))
    : 0

  // ── 3. DEDUCTIONS (attendance) ────────────────
  const minuteRate = hourlyRate / 60
  const lateDeduction = parseFloat((minuteRate * attendance.lateMinutes).toFixed(2))
  const undertimeDeduction = parseFloat((minuteRate * attendance.undertimeMinutes).toFixed(2))
  const absenceDeduction = computeAbsenceDeduction(employee.dailyRate, attendance.absentDays)

  // ── 4. ALLOWANCES & DE MINIMIS ────────────────
  const deMinimisTotal = deMinimis.riceSubsidy + deMinimis.clothing +
    deMinimis.medical + deMinimis.laundry + deMinimis.meal + deMinimis.other

  const allowancesTotal = allowances.rice + allowances.clothing +
    allowances.medical + allowances.transportation + allowances.other
  const otherEarnings = input.additionalTaxableIncome + input.additionalNonTaxableIncome

  // ── 5. GROSS PAY ──────────────────────────────
  // Gross includes all earnings + allowances before deductions
  const grossPay = parseFloat((
    basicPay
    + regularOtAmount
    + restDayOtAmount
    + holidayOtAmount
    + nightDiffAmount
    + holidayPayAmount
    + regularHolidayNonWorkPay
    + allowancesTotal
    + deMinimisTotal
    + otherEarnings
  ).toFixed(2))

  // ── 6. GOVERNMENT CONTRIBUTIONS ───────────────
  const monthlySalary = employee.basicSalary

  const sssRaw = getSSSForPeriod(monthlySalary, period.isFirstCutoff, period.payFrequency)
  const phRaw = getPhilHealthForPeriod(monthlySalary, period.isFirstCutoff, period.payFrequency)
  const pagibigRaw = getPagIBIGForPeriod(monthlySalary, period.isFirstCutoff, period.payFrequency)

  // Apply per-employee deduction toggles
  const sss = employee.sssEnabled
    ? sssRaw
    : { employee: 0, ec: 0, employer: 0 }
  const ph = employee.philhealthEnabled
    ? phRaw
    : { employee: 0, employer: 0 }
  const pagibig = employee.pagibigEnabled
    ? pagibigRaw
    : { employee: 0, employer: 0 }

  // ── 7. WITHHOLDING TAX ────────────────────────
  const taxResult = computeWithholdingTax({
    basicAndAllowances: basicPay + allowancesTotal - lateDeduction - undertimeDeduction - absenceDeduction,
    overtimeAndPremium: regularOtAmount + restDayOtAmount + holidayOtAmount + nightDiffAmount + holidayPayAmount,
    deMinimisNonTaxable: deMinimisTotal,
    additionalNonTaxable: input.additionalNonTaxableIncome,
    sssEmployee: sss.employee,
    philhealthEmployee: ph.employee,
    pagibigEmployee: pagibig.employee,
    ytdWithholdingTax: ytd.withholdingTax,
    payPeriodsInYear,
    isExempt: employee.isExemptFromTax || !employee.withholdingTaxEnabled,
    isMinimumWageEarner: employee.isMinimumWageEarner,
  })

  // ── 8. LOAN DEDUCTIONS ────────────────────────
  const loanDeductions = loans.reduce((sum, l) => sum + (grossPay > l.amount ? l.amount : 0), 0)

  // ── 9. 13TH MONTH CONTRIBUTION ────────────────
  // Accrue 1/12 of basic pay earned this period
  const thirteenthMonthContribution = parseFloat((basicPay / 12).toFixed(2))

  // ── 10. TOTALS ────────────────────────────────
  const totalDeductions = parseFloat((
    sss.employee
    + sss.ec
    + ph.employee
    + pagibig.employee
    + taxResult.withholdingTax
    + loanDeductions
    + lateDeduction
    + undertimeDeduction
    + absenceDeduction
  ).toFixed(2))

  const netPay = parseFloat((grossPay - totalDeductions).toFixed(2))

  // ── 11. YTD UPDATES ───────────────────────────
  const ytdGrossPay = ytd.grossPay + grossPay
  const ytdTaxableIncome = ytd.taxableIncome + taxResult.taxableIncome
  const ytdWithholdingTax = ytd.withholdingTax + taxResult.withholdingTax

  return {
    basicPay,
    regularOtAmount,
    restDayOtAmount,
    holidayOtAmount,
    nightDiffAmount,
    holidayPayAmount: holidayPayAmount + regularHolidayNonWorkPay,
    allowancesTotal,
    deMinimisTotal,
    otherEarnings,
    grossPay,
    sssEmployee: sss.employee,
    sssEc: sss.ec,
    philhealthEmployee: ph.employee,
    pagibigEmployee: pagibig.employee,
    sssEmployer: sss.employer,
    philhealthEmployer: ph.employer,
    pagibigEmployer: pagibig.employee,  // same rate as employee for PhilHealth
    taxableIncome: taxResult.taxableIncome,
    nonTaxableIncome: taxResult.nonTaxableIncome,
    withholdingTax: taxResult.withholdingTax,
    lateDeduction,
    undertimeDeduction,
    absenceDeduction,
    loanDeductions,
    otherDeductions: 0,
    totalDeductions,
    netPay,
    thirteenthMonthContribution,
    ytdGrossPay,
    ytdTaxableIncome,
    ytdWithholdingTax,
  }
}

function computeBasicPay(
  basicSalary: number,
  rateType: string,
  daysWorked: number,
  workingDaysInPeriod: number,
  payFrequency: string
): number {
  if (rateType === 'DAILY') {
    return parseFloat((basicSalary * daysWorked).toFixed(2))
  }

  if (rateType === 'HOURLY') {
    // hourly × 8 × days worked
    return parseFloat((basicSalary * 8 * daysWorked).toFixed(2))
  }

  // Monthly rate: period salary = monthly / 2 for semi-monthly, full for monthly
  const periodSalary = payFrequency === 'SEMI_MONTHLY' ? basicSalary / 2 : basicSalary

  if (daysWorked >= workingDaysInPeriod) return parseFloat(periodSalary.toFixed(2))

  // Pro-rate for incomplete period
  const dailyRate = periodSalary / workingDaysInPeriod
  return parseFloat((dailyRate * daysWorked).toFixed(2))
}
