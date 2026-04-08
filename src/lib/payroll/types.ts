export interface PayrollInput {
  employee: {
    id: string
    basicSalary: number
    dailyRate: number
    hourlyRate: number
    rateType: 'MONTHLY' | 'DAILY' | 'HOURLY'
    payFrequency: 'SEMI_MONTHLY' | 'MONTHLY'
    isMinimumWageEarner: boolean
    isExemptFromTax: boolean
  }
  period: {
    start: Date
    end: Date
    workingDays: number
    payFrequency: 'SEMI_MONTHLY' | 'MONTHLY'
    isFirstCutoff: boolean  // true = 1st–15th, false = 16th–end
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
