export interface PayrollInput {
  employee: {
    id: string
    basicSalary: number
    dailyRate: number
    hourlyRate: number
    rateType: 'MONTHLY' | 'DAILY' | 'HOURLY'
    /**
     * Whether timesheet/DTR time-tracking drives this employee's pay. When
     * FALSE, basic pay is the full daily-rate × days (not hour-prorated), so
     * a late arrival must be charged via the late deduction rather than a
     * silent hour shortfall — see the skipLate logic in the engine.
     */
    trackTime?: boolean
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
     * has it enabled. Useful for HOURLY/DAILY hires where basic pay
     * already pro-rates by actual hours worked — deducting late on top
     * would double-count the same missed minutes.
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
  }
  attendance: {
    daysWorked: number
    regularHours: number
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
    /**
     * Pre-classified DOLE premium hours by category (from
     * src/lib/payroll/premium-matrix.ts classifyShiftHours, aggregated across
     * the period's worked shifts). When present, the engine prices ALL
     * premium pay (night diff, holiday, rest day, OT and their combinations
     * incl. LHND) from this matrix and IGNORES the legacy day-count holiday /
     * standalone night-diff inputs above — so a night shift crossing midnight
     * into a legal holiday yields the correct LH + LHND split. When absent,
     * the engine falls back to the legacy per-field computation (used by
     * callers that don't yet classify, e.g. final-pay).
     */
    premiums?: import('./premium-matrix').CategoryHours
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
  nightDiffAmount: number          // total ND (regular + holiday)
  holidayNightDiffAmount: number   // the "Holiday ND" slice of nightDiffAmount
  holidayPayAmount: number
  /**
   * Itemized premium lines (only populated when attendance.premiums was
   * provided). The compute route persists these as PayslipPremium rows.
   */
  premiumLineItems?: import('./premium-matrix').PremiumLineItem[]
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
