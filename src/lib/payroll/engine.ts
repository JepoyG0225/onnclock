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

  // Periods in a year drives both withholding-tax annualization and the
  // even-split divisor for mandatory deductions below.
  const payPeriodsInYear =
    period.payFrequency === 'MONTHLY' ? 12
    : period.payFrequency === 'SEMI_MONTHLY' ? 24
    : period.payFrequency === 'WEEKLY' ? 52
    : 261 // DAILY — typical working days per year

  // ── 1. BASIC PAY ─────────────────────────────
  // For HOURLY employees we feed in the actual regular hours sourced from
  // DTR timestamps (compute route) so basic pay = hourlyRate × hoursWorked
  // rather than the old hourlyRate × 8 × daysWorked which silently assumed
  // a full 8-hour shift every day even on half-day shifts.
  const basicPay = computeBasicPay(
    employee.basicSalary,
    employee.rateType,
    attendance.daysWorked,
    period.workingDays,
    period.payFrequency,
    attendance.regularHours,
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

  // Holiday pay premium — ONLY for holidays the employee actually clocked in
  // on. This is the visible holidayPayAmount on the payslip.
  //
  //   Worked REGULAR holiday → +100% of daily rate (premium on top of the
  //                            basic 100% they earn for working that day)
  //   Worked SPECIAL holiday → +30% of daily rate
  //
  // Unworked holidays don't appear here — they're rolled into basic pay
  // below (treating the employee as "present" for the holiday).
  //
  // Per-employee override: if disableHolidayPay is set on the Employee
  // record, zero out BOTH premiums AND the Art. 94 non-work credit
  // regardless of company calendar / rate type. Used for project-based /
  // contractor roles where holidays aren't paid.
  const disableHoliday = employee.disableHolidayPay === true

  // HOURLY employees: pro-rate the holiday premium by the actual regular
  // hours they clocked into on the holiday(s) — not the full daily rate.
  // A 4-hour shift on a regular holiday gets +100% on those 4 hours
  // (hourlyRate × 1.0 × 4), not a full day's premium.
  //
  // DAILY / MONTHLY employees keep the daily-rate-based premium: their
  // wage isn't pegged to hours, so the day-count formula matches PH
  // practice (DOLE Handbook Ch. 6 §3: regular holiday worked = 200%
  // of daily rate; special non-working worked = 130% of daily rate).
  let regularHolidayPremium = 0
  let specialHolidayPremium = 0
  if (!disableHoliday) {
    if (employee.rateType === 'HOURLY') {
      const regHrs = attendance.regularHolidayHoursWorked ?? 0
      const spcHrs = attendance.specialHolidayHoursWorked ?? 0
      // +100% premium for REGULAR holiday hours
      regularHolidayPremium = regHrs > 0
        ? parseFloat((hourlyRate * regHrs).toFixed(2))
        : 0
      // +30% premium for SPECIAL non-working holiday hours
      specialHolidayPremium = spcHrs > 0
        ? parseFloat((hourlyRate * spcHrs * 0.3).toFixed(2))
        : 0
    } else {
      regularHolidayPremium = computeHolidayPayAdditional(
        employee.dailyRate, attendance.regularHolidaysWorked, 'REGULAR'
      )
      specialHolidayPremium = computeHolidayPayAdditional(
        employee.dailyRate, attendance.specialHolidaysWorked, 'SPECIAL_NON_WORKING'
      )
    }
  }
  const holidayPayAmount = regularHolidayPremium + specialHolidayPremium

  // Unworked-holiday handling — fold into basic pay (no separate line):
  //
  //   MONTHLY: monthly salary already covers all calendar days including
  //            holidays, so basic pay needs no adjustment.
  //   DAILY:   Art. 94 says regular holidays are paid even if not worked.
  //            Add dailyRate × nonWorkDays to basic so the day shows up
  //            as if the employee was present.
  //   HOURLY:  paid strictly by actual time entry — no clock-in, no pay
  //            (matches PH practice for hourly/casual hires whose wage
  //            is pegged to hours rather than a fixed daily rate).
  const regularHolidayNonWorkPay = 0  // Always 0 — never shown as its own line
  let basicPayWithHolidayCredit = basicPay
  if (!disableHoliday
      && employee.rateType === 'DAILY'
      && attendance.regularHolidayNonWorkDays && attendance.regularHolidayNonWorkDays > 0) {
    const credit = parseFloat((employee.dailyRate * attendance.regularHolidayNonWorkDays).toFixed(2))
    basicPayWithHolidayCredit = parseFloat((basicPay + credit).toFixed(2))
  }

  // ── 3. DEDUCTIONS (attendance) ────────────────
  const minuteRate = hourlyRate / 60
  // Late + undertime deductions are suppressed when EITHER the
  // company-wide policy OR the per-employee toggle says so. The DTR
  // still records the raw minutes for audit — they just don't translate
  // to a peso amount on the payslip.
  //
  // Per-employee toggles exist because HOURLY/DAILY employees' basic
  // pay is already pro-rated by actual hours worked, so deducting
  // late/UT on top would double-count the same missed minutes. HR
  // typically flips these on for HOURLY/DAILY hires and leaves them
  // off for MONTHLY hires (whose basic is a fixed salary).
  const skipLate = period.disableLateDeductions || employee.disableLateDeduction === true
  const skipUt = employee.disableUndertimeDeduction === true
  const lateDeduction = skipLate
    ? 0
    : parseFloat((minuteRate * attendance.lateMinutes).toFixed(2))
  const undertimeDeduction = skipUt
    ? 0
    : parseFloat((minuteRate * attendance.undertimeMinutes).toFixed(2))
  const absenceDeduction = computeAbsenceDeduction(employee.dailyRate, attendance.absentDays)

  // ── 4. ALLOWANCES & DE MINIMIS ────────────────
  const deMinimisTotal = deMinimis.riceSubsidy + deMinimis.clothing +
    deMinimis.medical + deMinimis.laundry + deMinimis.meal + deMinimis.other

  const allowancesTotal = allowances.rice + allowances.clothing +
    allowances.medical + allowances.transportation + allowances.other
  const otherEarnings = input.additionalTaxableIncome + input.additionalNonTaxableIncome

  // ── 5. GROSS PAY ──────────────────────────────
  // basicPayWithHolidayCredit: basic + Art. 94 credit for unworked regular
  // holidays (DAILY/HOURLY only; monthly basic already covers it).
  // holidayPayAmount: ONLY the premium for holidays actually worked.
  const grossPay = parseFloat((
    basicPayWithHolidayCredit
    + regularOtAmount
    + restDayOtAmount
    + holidayOtAmount
    + nightDiffAmount
    + holidayPayAmount
    + regularHolidayNonWorkPay   // always 0 — kept for shape compatibility
    + allowancesTotal
    + deMinimisTotal
    + otherEarnings
  ).toFixed(2))

  // ── 6. GOVERNMENT CONTRIBUTIONS ───────────────
  // Bracket lookup is driven by what the employee ACTUALLY earned this
  // period (post-attendance-deductions), annualized to monthly. Falls
  // back to the recorded basicSalary when basicPay is zero so the bracket
  // stays consistent. Each contribution is then split evenly across the
  // periods in a month (SEMI_MONTHLY = ½, WEEKLY = ¼, DAILY = 1/22)
  // instead of the previous "first-cutoff-takes-all" behavior.
  //
  // IMPORTANT: includes the Art. 94 holiday credit (basicPayWithHolidayCredit)
  // because per DOLE Handbook regular-holiday pay is considered wages —
  // SSS / PhilHealth / Pag-IBIG contributions are computed on wages, not
  // worked-day-only basic. Previously we used `basicPay` (worked only)
  // which understated Pag-IBIG (and PhilHealth/SSS for higher brackets)
  // for any DAILY/HOURLY employee with an unworked regular holiday in
  // the period.
  const actualEarned = basicPayWithHolidayCredit - lateDeduction - undertimeDeduction - absenceDeduction
  const sssRaw = getSSSForPeriod(actualEarned, employee.basicSalary, period.payFrequency)
  const phRaw = getPhilHealthForPeriod(actualEarned, employee.basicSalary, period.payFrequency)
  const pagibigRaw = getPagIBIGForPeriod(actualEarned, employee.basicSalary, period.payFrequency)

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
  // Same reasoning as contributions: the WHT basis includes Art. 94 credit
  // since DOLE/BIR treat unworked regular-holiday pay as basic wages.
  const taxResult = computeWithholdingTax({
    basicAndAllowances: basicPayWithHolidayCredit + allowancesTotal - lateDeduction - undertimeDeduction - absenceDeduction,
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
  // Accrue 1/12 of basic pay earned this period. Per DOLE Labor Advisory,
  // Art. 94 holiday pay for unworked regular holidays counts as basic
  // salary for 13th-month purposes — so use basicPayWithHolidayCredit,
  // not the raw worked-day basicPay.
  const thirteenthMonthContribution = parseFloat((basicPayWithHolidayCredit / 12).toFixed(2))

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
    basicPay: basicPayWithHolidayCredit,
    regularOtAmount,
    restDayOtAmount,
    holidayOtAmount,
    nightDiffAmount,
    // Only premium for WORKED holidays — unworked is absorbed into basic
    holidayPayAmount,
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
  payFrequency: string,
  regularHours: number,
): number {
  if (rateType === 'DAILY') {
    // Pro-rate basic pay by actual regular hours so a half-day clock-in
    // pays a half-day. Previously DAILY counted every "checked-in" DTR
    // as a full day regardless of hours — a 4-hour shift paid the same
    // as an 8-hour shift, which violates strict DOLE "no work, no pay".
    //
    // Falls back to whole-day count when no DTR-derived hours exist
    // (legacy data, time-tracking off, manual present-flag without
    // timestamps) so historical behavior holds for those rows.
    const STANDARD_HOURS_PER_DAY = 8
    const fractionalDays = regularHours > 0
      ? regularHours / STANDARD_HOURS_PER_DAY
      : daysWorked
    return parseFloat((basicSalary * fractionalDays).toFixed(2))
  }

  if (rateType === 'HOURLY') {
    // basicSalary IS the hourly rate. Pay = rate × actual regular hours
    // worked (already capped at the schedule's workHoursPerDay upstream
    // so overtime hours don't double-count in regular pay).
    // Fallback to daysWorked × 8 only when no DTR-derived hours exist
    // (e.g. legacy data, no time tracking) so we never silently zero out
    // pay for an HOURLY employee on a manual run.
    const hours = regularHours > 0 ? regularHours : daysWorked * 8
    return parseFloat((basicSalary * hours).toFixed(2))
  }

  // Monthly rate: pro-rate the monthly salary down to this pay period's share.
  //   MONTHLY → full month, SEMI → half, WEEKLY → quarter, DAILY → 1/22.
  const divisor = payFrequency === 'SEMI_MONTHLY' ? 2
    : payFrequency === 'WEEKLY' ? 4
    : payFrequency === 'DAILY' ? 22
    : 1
  const periodSalary = basicSalary / divisor

  if (daysWorked >= workingDaysInPeriod) return parseFloat(periodSalary.toFixed(2))

  // Pro-rate for incomplete period
  const dailyRate = periodSalary / workingDaysInPeriod
  return parseFloat((dailyRate * daysWorked).toFixed(2))
}
