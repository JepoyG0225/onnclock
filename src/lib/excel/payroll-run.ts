import * as XLSX from 'xlsx'

export interface PayrollRunRow {
  employeeNo: string
  lastName: string
  firstName: string
  department: string
  position: string
  basicPay: number
  allowances: number
  otAmount: number
  grossPay: number
  // Employee contributions
  sssEmployee: number
  philhealthEmployee: number
  pagibigEmployee: number
  withholdingTax: number
  loans: number
  otherDeductions: number
  totalDeductions: number
  netPay: number
  // Employer shares
  sssEmployer: number
  philhealthEmployer: number
  pagibigEmployer: number
  sssEc: number
  totalEmployerCost: number
}

function peso(n: number) {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function generatePayrollRunExcel(
  companyName: string,
  period: string,
  payDate: string,
  rows: PayrollRunRow[]
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Payroll Summary ──────────────────────────────────────────────
  const summaryHeader = [
    [`${companyName} — PAYROLL REGISTER`],
    [`Pay Period: ${period}    Pay Date: ${payDate}`],
    [`Generated: ${new Date().toLocaleDateString('en-PH')}`],
    [],
    [
      'Emp No.', 'Last Name', 'First Name', 'Department', 'Position',
      'Basic Pay', 'Allowances', 'OT / ND', 'Gross Pay',
      'SSS (EE)', 'PhilHealth (EE)', 'Pag-IBIG (EE)', 'W/Tax',
      'Loans', 'Other Ded.', 'Total Ded.', 'Net Pay',
      // Employer shares
      'SSS (ER)', 'SSS EC', 'PhilHealth (ER)', 'Pag-IBIG (ER)', 'Total ER Cost',
    ],
  ]

  const totals = (key: keyof PayrollRunRow) =>
    rows.reduce((s, r) => s + (r[key] as number), 0)

  const bodyData = rows.map(r => [
    r.employeeNo, r.lastName, r.firstName, r.department, r.position,
    r.basicPay, r.allowances, r.otAmount, r.grossPay,
    r.sssEmployee, r.philhealthEmployee, r.pagibigEmployee, r.withholdingTax,
    r.loans, r.otherDeductions, r.totalDeductions, r.netPay,
    r.sssEmployer, r.sssEc, r.philhealthEmployer, r.pagibigEmployer, r.totalEmployerCost,
  ])

  const totalRow = [
    '', '', '', '', 'TOTAL',
    totals('basicPay'), totals('allowances'), totals('otAmount'), totals('grossPay'),
    totals('sssEmployee'), totals('philhealthEmployee'), totals('pagibigEmployee'), totals('withholdingTax'),
    totals('loans'), totals('otherDeductions'), totals('totalDeductions'), totals('netPay'),
    totals('sssEmployer'), totals('sssEc'), totals('philhealthEmployer'), totals('pagibigEmployer'), totals('totalEmployerCost'),
  ]

  const ws1Data = [...summaryHeader, ...bodyData, [], totalRow]
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data)
  ws1['!cols'] = Array(22).fill({ wch: 14 })
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 21 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 21 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 21 } },
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
  rows: PayrollRunRow[]
): string {
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
