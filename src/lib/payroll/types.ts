export interface PayrollInput {
  employee: {
    id: string
    basicSalary: number
    dailyRate: number
    hourlyRate: number
    rateType: 'MONTHLY' | 'DAILY' | 'HOURLY'
    payFrequency: 'SEMI_MONTHLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY'
    isMinimumWageEarner: boolean
    isExemptFromTax: boolean
    /**
     * Per-employee override: when TRUE the engine zeros out ALL holiday
     * pay (worked premium + Art. 94 unworked credit) regardless of the
     * company calendar. Useful for project-based / contractor roles.
     */
    disableHolidayPay?: boolean
    /**
     * Per-employee override: when TRUE the late-minutes pay deduction
     * is suppressed for THIS employee even if the company-wide setting
     * has it enabled. This is the explicit opt-out for employees whose
     * tardiness should be tracked in DTR without affecting payroll.
     */
    disableLateDeduction?: boolean
    /**
     * Same idea, but for undertime minutes.
     */
    disableUndertimeDeduction?: boolean
    sssEnabled: boolean
    philhealthEnabled: boolean
    pagibigEnabled: boolean
    withholdingTaxEnabled: boolean
  }
  period: {
    start: Date
    end: Date
    workingDays: number
    payFrequency: 'SEMI_MONTHLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY'
    isFirstCutoff: boolean  // true = 1st–15th, false = 16th–end
    nightDifferentialRate: number
    regularOtRate?: number
    restDayOtRate?: number
    regularHolidayOtRate?: number
    specialHolidayOtRate?: number
    /**
     * When TRUE, late minutes are tracked on the DTR but NOT converted into
     * a pay deduction. Companies that handle tardiness via the
     * disciplinary process can flip this to keep payroll separate.
     */
    disableLateDeductions?: boolean
    /**
     * Same, for undertime minutes. Independent of the late toggle so a
     * company can dock one and not the other.
     */
    disableUndertimeDeductions?: boolean
    /**
     * Standard paid hours in one work day, from the employee's work
     * schedule. Divisor for converting daily → hourly → per-minute rates.
     * Defaults to 8 when absent.
     */
    workHoursPerDay?: number
    /**
     * Scheduled work days in a month, from the company payroll config.
     * Divisor for converting a MONTHLY salary → daily rate. Defaults to 22
     * (the value this app previously hardcoded) when absent.
     */
    workingDaysPerMonth?: number
  }
  attendance: {
    daysWorked: number
    regularHours: number
    /**
     * Hours the employee was SCHEDULED to work on the days they were
     * present (or on paid leave) — i.e. workHoursPerDay × paid days,
     * ignoring how late they clocked in or how early they clocked out.
     *
     * This is the basis for basic pay so the payslip's Basic Pay line
     * shows the full gross entitlement. Tardiness and early-outs are
     * then charged ONCE, in the separate Late / Undertime deduction
     * column, instead of being silently baked into basic pay.
     *
     * Absent days are NOT included here — the engine adds them back from
     * `absentDays` so basic pay covers them too and the Absences column
     * deducts them exactly once.
     *
     * Falls back to `regularHours` when absent (legacy runs / callers
     * that don't supply it) so historical behavior is preserved.
     */
    scheduledHours?: number
    regularOtHours: number        // OT on regular weekday
    restDayOtHours: number        // OT on rest day
    regularHolidayOtHours: number
    specialHolidayOtHours: number
    nightDiffHours: number
    lateMinutes: number
    undertimeMinutes: number
    absentDays: number
    regularHolidaysWorked: number
    specialHolidaysWorked: number
    regularHolidayNonWorkDays?: number
    /**
     * Actual regular hours an HOURLY employee clocked into on REGULAR
     * holidays during the period (sum across all regular-holiday DTRs,
     * capped at workHoursPerDay per day so OT doesn't double-count).
     * Engine uses this — instead of `regularHolidaysWorked × dailyRate`
     * — to pro-rate the +100% holiday premium so a half-day clock-in
     * yields a half-day premium. MONTHLY/DAILY ignore this field.
     */
    regularHolidayHoursWorked?: number
    /** Same as above, for SPECIAL_NON_WORKING holidays (+30% premium). */
    specialHolidayHoursWorked?: number
  }
  loans: Array<{
    id: string
    type: string
    amount: number              // amortization per period
  }>
  deMinimis: {
    riceSubsidy: number
    clothing: number
    medical: number
    laundry: number
    meal: number
    other: number
  }
  allowances: {
    rice: number
    clothing: number
    medical: number
    transportation: number
    other: number
  }
  additionalTaxableIncome: number
  additionalNonTaxableIncome: number
  ytd: {
    grossPay: number
    taxableIncome: number
    withholdingTax: number
    thirteenthMonthContrib: number
  }
}

export interface PayrollResult {
  // ── EARNINGS ──
  basicPay: number
  regularOtAmount: number
  restDayOtAmount: number
  holidayOtAmount: number
  nightDiffAmount: number
  holidayPayAmount: number
  allowancesTotal: number         // taxable allowances
  deMinimisTotal: number          // non-taxable de minimis
  otherEarnings: number
  grossPay: number

  // ── EMPLOYEE CONTRIBUTIONS ──
  sssEmployee: number
  sssEc: number
  philhealthEmployee: number
  pagibigEmployee: number

  // ── EMPLOYER CONTRIBUTIONS (for reports) ──
  sssEmployer: number
  philhealthEmployer: number
  pagibigEmployer: number

  // ── TAX ──
  taxableIncome: number
  nonTaxableIncome: number
  withholdingTax: number

  // ── OTHER DEDUCTIONS ──
  lateDeduction: number
  undertimeDeduction: number
  absenceDeduction: number
  loanDeductions: number
  otherDeductions: number

  totalDeductions: number
  netPay: number

  // ── 13TH MONTH TRACKING ──
  thirteenthMonthContribution: number

  // ── YTD UPDATES ──
  ytdGrossPay: number
  ytdTaxableIncome: number
  ytdWithholdingTax: number
}
