/**
 * BIR Reports:
 *  - BIR 1601C: Monthly Remittance Return of Income Taxes Withheld
 *  - BIR 1604CF: Annual Alphalist of Employees
 *  - Payroll Register (internal)
 */
import * as XLSX from 'xlsx'

// ─── BIR 1601C ───────────────────────────────────────────────────────────────

export interface BIR1601CData {
  companyName: string
  tin: string
  address: string
  month: string
  year: number
  totalCompensation: number
  totalTaxWithheld: number
  employees: {
    tin: string
    lastName: string
    firstName: string
    middleName: string
    compensation: number
    taxWithheld: number
  }[]
}

export function generateBIR1601C(data: BIR1601CData): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  const summaryData = [
    ['BIR FORM 1601C — MONTHLY REMITTANCE RETURN OF INCOME TAXES WITHHELD ON COMPENSATION'],
    [],
    ['Taxpayer Name:', data.companyName],
    ['TIN:', data.tin],
    ['Address:', data.address],
    ['Reference Month:', data.month],
    ['Taxable Year:', data.year],
    [],
    ['SUMMARY'],
    ['Total Compensation Paid:', data.totalCompensation],
    ['Total Tax Withheld (to remit):', data.totalTaxWithheld],
    [],
    ['EMPLOYEE ALPHALIST'],
    [],
    ['TIN', 'Last Name', 'First Name', 'Middle Name', 'Compensation', 'Tax Withheld'],
    ...data.employees.map(e => [
      e.tin || '',
      e.lastName,
      e.firstName,
      e.middleName || '',
      e.compensation,
      e.taxWithheld,
    ]),
    [],
    [
      '', '', '', 'TOTAL',
      data.employees.reduce((s, e) => s + e.compensation, 0),
      data.employees.reduce((s, e) => s + e.taxWithheld, 0),
    ],
  ]

  const ws = XLSX.utils.aoa_to_sheet(summaryData)
  ws['!cols'] = [
    { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }]

  XLSX.utils.book_append_sheet(wb, ws, '1601C')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

// ─── BIR 1604CF Alphalist ─────────────────────────────────────────────────────

export interface AlphalistEmployee {
  seq: number
  tin: string
  lastName: string
  firstName: string
  middleName: string
  dateOfBirth: string
  address: string
  statusOfEmployment: string   // 'P' = present, 'R' = resigned
  regularCompensation: number
  supplementaryCompensation: number
  totalCompensation: number
  taxWithheld: number
  annualTaxDue: number
  taxRefund?: number
}

export function generateAlphalist1604CF(
  companyName: string,
  tin: string,
  year: number,
  employees: AlphalistEmployee[]
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  const headers = [
    ['BIR FORM 1604CF — ANNUAL INFORMATION RETURN OF INCOME TAXES WITHHELD ON COMPENSATION'],
    [`Employer: ${companyName}`],
    [`TIN: ${tin}`],
    [`Taxable Year: ${year}`],
    [],
    ['Annex A — Alphalist of Employees'],
    [],
    [
      'Seq', 'TIN', 'Last Name', 'First Name', 'Middle Name',
      'Birth Date', 'Status', 'Regular Comp', 'Suppl. Comp',
      'Total Comp', 'Tax Withheld', 'Tax Due', 'Tax Refund',
    ],
  ]

  const rows = employees.map(e => [
    e.seq, e.tin || '', e.lastName, e.firstName, e.middleName || '',
    e.dateOfBirth || '', e.statusOfEmployment,
    e.regularCompensation, e.supplementaryCompensation,
    e.totalCompensation, e.taxWithheld, e.annualTaxDue, e.taxRefund ?? 0,
  ])

  const allData = [...headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(allData)

  ws['!cols'] = [
    { wch: 5 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 14 },
    { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, '1604CF Alphalist')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

// ─── Payroll Register ─────────────────────────────────────────────────────────

export interface PayrollRegisterRow {
  employeeNo: string
  lastName: string
  firstName: string
  department: string
  basicPay: number
  allowances: number
  otAmount: number
  grossPay: number
  sssEmployee: number
  philhealthEmployee: number
  pagibigEmployee: number
  withholdingTax: number
  loans: number
  otherDeductions: number
  totalDeductions: number
  netPay: number
}

export function generatePayrollRegister(
  companyName: string,
  period: string,
  rows: PayrollRegisterRow[]
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  const headerData = [
    [`${companyName} — PAYROLL REGISTER`],
    [`Pay Period: ${period}`],
    [],
    [
      'Employee No.', 'Last Name', 'First Name', 'Department',
      'Basic Pay', 'Allowances', 'OT Amount', 'Gross Pay',
      'SSS', 'PhilHealth', 'Pag-IBIG', 'W/Tax',
      'Loans', 'Other Ded.', 'Total Ded.', 'Net Pay',
    ],
  ]

  const bodyData = rows.map(r => [
    r.employeeNo, r.lastName, r.firstName, r.department,
    r.basicPay, r.allowances, r.otAmount, r.grossPay,
    r.sssEmployee, r.philhealthEmployee, r.pagibigEmployee, r.withholdingTax,
    r.loans, r.otherDeductions, r.totalDeductions, r.netPay,
  ])

  const totals = (key: keyof PayrollRegisterRow) =>
    rows.reduce((s, r) => s + (r[key] as number), 0)

  const totalRow = [
    '', '', '', 'TOTAL',
    totals('basicPay'), totals('allowances'), totals('otAmount'), totals('grossPay'),
    totals('sssEmployee'), totals('philhealthEmployee'), totals('pagibigEmployee'), totals('withholdingTax'),
    totals('loans'), totals('otherDeductions'), totals('totalDeductions'), totals('netPay'),
  ]

  const allData = [...headerData, ...bodyData, [], totalRow]
  const ws = XLSX.utils.aoa_to_sheet(allData)

  ws['!cols'] = Array(16).fill({ wch: 13 })
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 15 } }]

  XLSX.utils.book_append_sheet(wb, ws, 'Payroll Register')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
