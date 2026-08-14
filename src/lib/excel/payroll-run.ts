import * as XLSX from 'xlsx'

export interface PayrollRunRow {
  employeeNo: string
  lastName: string
  firstName: string
  department: string
  position: string
  basicPay: number
  allowances: number
  /** Per-income-type amounts keyed by typeName */
  incomeItems?: Record<string, number>
  regularOt: number
  restDayOt: number
  holidayOt: number
  holidayPay: number
  nightDiff: number
  grossPay: number
  // Employee contributions
  sssEmployee: number
  philhealthEmployee: number
  pagibigEmployee: number
  withholdingTax: number
  sssLoan: number
  pagibigLoan: number
  companyLoan: number
  lateDeduction: number
  undertimeDeduction: number
  absenceDeduction: number
  /** Recurring and custom deductions keyed by their own label. */
  deductionItems?: Record<string, number>
  totalDeductions: number
  netPay: number
  // Employer shares
  sssEmployer: number
  philhealthEmployer: number
  pagibigEmployer: number
  sssEc: number
  totalEmployerCost: number
}

function makePeso(currency: string) {
  return (n: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'PHP',
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(n)
}

export function generatePayrollRunExcel(
  companyName: string,
  period: string,
  payDate: string,
  rows: PayrollRunRow[]
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  // ── Discover unique income type names across all employees ────────────────
  const incomeTypeSet = new Set<string>()
  for (const r of rows) {
    if (r.incomeItems) {
      for (const key of Object.keys(r.incomeItems)) incomeTypeSet.add(key)
    }
  }
  const incomeTypeNames = [...incomeTypeSet].sort()
  const deductionTypeSet = new Set<string>()
  for (const r of rows) {
    if (r.deductionItems) {
      for (const key of Object.keys(r.deductionItems)) deductionTypeSet.add(key)
    }
  }
  const deductionTypeNames = [...deductionTypeSet].sort()

  // ── Sheet 1: Payroll Summary ──────────────────────────────────────────────
  const summaryHeader = [
    [`${companyName} — PAYROLL REGISTER`],
    [`Pay Period: ${period}    Pay Date: ${payDate}`],
    [`Generated: ${new Date().toLocaleDateString('en-PH')}`],
    [],
    [
      'Emp No.', 'Last Name', 'First Name', 'Department', 'Position',
      'Basic Pay', 'Allowances',
      ...incomeTypeNames,
      'Regular OT', 'Rest Day OT', 'Holiday OT', 'Holiday Pay', 'Night Differential', 'Gross Pay',
      'SSS (EE)', 'PhilHealth (EE)', 'Pag-IBIG (EE)', 'W/Tax',
      'SSS Loan', 'Pag-IBIG Loan', 'Company Loan', 'Late', 'Undertime', 'Absence',
      ...deductionTypeNames,
      'Total Ded.', 'Net Pay',
      // Employer shares
      'SSS (ER)', 'SSS EC', 'PhilHealth (ER)', 'Pag-IBIG (ER)', 'Total ER Cost',
    ],
  ]

  const totals = (key: keyof PayrollRunRow) =>
    rows.reduce((s, r) => s + (r[key] as number), 0)

  const bodyData = rows.map(r => [
    r.employeeNo, r.lastName, r.firstName, r.department, r.position,
    r.basicPay, r.allowances,
    ...incomeTypeNames.map(name => r.incomeItems?.[name] ?? 0),
    r.regularOt, r.restDayOt, r.holidayOt, r.holidayPay, r.nightDiff, r.grossPay,
    r.sssEmployee, r.philhealthEmployee, r.pagibigEmployee, r.withholdingTax,
    r.sssLoan, r.pagibigLoan, r.companyLoan, r.lateDeduction, r.undertimeDeduction, r.absenceDeduction,
    ...deductionTypeNames.map(name => r.deductionItems?.[name] ?? 0),
    r.totalDeductions, r.netPay,
    r.sssEmployer, r.sssEc, r.philhealthEmployer, r.pagibigEmployer, r.totalEmployerCost,
  ])

  const incomeTypeTotals = incomeTypeNames.map(name =>
    rows.reduce((s, r) => s + (r.incomeItems?.[name] ?? 0), 0)
  )
  const deductionTypeTotals = deductionTypeNames.map(name =>
    rows.reduce((s, r) => s + (r.deductionItems?.[name] ?? 0), 0)
  )

  const totalRow = [
    '', '', '', '', 'TOTAL',
    totals('basicPay'), totals('allowances'),
    ...incomeTypeTotals,
    totals('regularOt'), totals('restDayOt'), totals('holidayOt'), totals('holidayPay'), totals('nightDiff'), totals('grossPay'),
    totals('sssEmployee'), totals('philhealthEmployee'), totals('pagibigEmployee'), totals('withholdingTax'),
    totals('sssLoan'), totals('pagibigLoan'), totals('companyLoan'), totals('lateDeduction'), totals('undertimeDeduction'), totals('absenceDeduction'),
    ...deductionTypeTotals,
    totals('totalDeductions'), totals('netPay'),
    totals('sssEmployer'), totals('sssEc'), totals('philhealthEmployer'), totals('pagibigEmployer'), totals('totalEmployerCost'),
  ]

  const colCount = 30 + incomeTypeNames.length + deductionTypeNames.length
  const ws1Data = [...summaryHeader, ...bodyData, [], totalRow]
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data)
  ws1['!cols'] = Array(colCount).fill({ wch: 14 })
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Payroll Register')

  // ── Sheet 2: Employer Cost Summary ───────────────────────────────────────
  const erHeader = [
    [`${companyName} — EMPLOYER COST SUMMARY`],
    [`Pay Period: ${period}    Pay Date: ${payDate}`],
    [],
    ['Emp No.', 'Last Name', 'First Name', 'Department',
      'Gross Pay', 'SSS (ER)', 'SSS EC', 'PhilHealth (ER)', 'Pag-IBIG (ER)', 'Total ER Cost'],
  ]
  const erBody = rows.map(r => [
    r.employeeNo, r.lastName, r.firstName, r.department,
    r.grossPay, r.sssEmployer, r.sssEc, r.philhealthEmployer, r.pagibigEmployer, r.totalEmployerCost,
  ])
  const erTotalRow = [
    '', '', '', 'TOTAL',
    totals('grossPay'), totals('sssEmployer'), totals('sssEc'), totals('philhealthEmployer'), totals('pagibigEmployer'), totals('totalEmployerCost'),
  ]
  const ws2Data = [...erHeader, ...erBody, [], erTotalRow]
  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data)
  ws2['!cols'] = Array(10).fill({ wch: 15 })
  ws2['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Employer Cost')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

export function generatePayrollRunSummaryText(
  companyName: string,
  period: string,
  payDate: string,
  rows: PayrollRunRow[],
  currency = 'PHP'
): string {
  const peso = makePeso(currency)
  const totals = (key: keyof PayrollRunRow) =>
    rows.reduce((s, r) => s + (r[key] as number), 0)

  const lines: string[] = [
    `${companyName}`,
    `PAYROLL REGISTER — ${period}`,
    `Pay Date: ${payDate}`,
    `Generated: ${new Date().toLocaleDateString('en-PH')}`,
    '',
    `Total Employees: ${rows.length}`,
    `Total Gross Pay:       ${peso(totals('grossPay'))}`,
    `Total Net Pay:         ${peso(totals('netPay'))}`,
    `Total Deductions:      ${peso(totals('totalDeductions'))}`,
    '',
    '--- Employee Contributions ---',
    `  SSS:                 ${peso(totals('sssEmployee'))}`,
    `  PhilHealth:          ${peso(totals('philhealthEmployee'))}`,
    `  Pag-IBIG:            ${peso(totals('pagibigEmployee'))}`,
    `  Withholding Tax:     ${peso(totals('withholdingTax'))}`,
    '',
    '--- Employer Shares ---',
    `  SSS:                 ${peso(totals('sssEmployer'))}`,
    `  SSS EC:              ${peso(totals('sssEc'))}`,
    `  PhilHealth:          ${peso(totals('philhealthEmployer'))}`,
    `  Pag-IBIG:            ${peso(totals('pagibigEmployer'))}`,
    `  Total Employer Cost: ${peso(totals('totalEmployerCost'))}`,
  ]
  return lines.join('\n')
}
