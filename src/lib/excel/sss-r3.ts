/**
 * SSS R3 — Contribution Collection List
 * Generates the monthly SSS R3 form in XLSX format
 */
import * as XLSX from 'xlsx'

export interface SSSR3Row {
  employeeNo: string
  sssNo: string
  lastName: string
  firstName: string
  middleName: string
  msc: number         // Monthly Salary Credit
  employeeShare: number
  employerShare: number
  ec: number
  total: number
}

export function generateSSSR3(
  companyName: string,
  month: string,         // "January 2025"
  year: number,
  rows: SSSR3Row[]
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  // Header rows
  const headerData = [
    ['SSS FORM R3 — CONTRIBUTION COLLECTION LIST'],
    [`Employer Name: ${companyName}`],
    [`Reference Month: ${month}`],
    [],
    [
      'Employee No.',
      'SSS Number',
      'Last Name',
      'First Name',
      'Middle Name',
      'MSC',
      'EE Share',
      'ER Share',
      'EC',
      'Total',
    ],
  ]

  const bodyData = rows.map((r, i) => [
    i + 1,
    r.sssNo || '',
    r.lastName,
    r.firstName,
    r.middleName || '',
    r.msc,
    r.employeeShare,
    r.employerShare,
    r.ec,
    r.total,
  ])

  const totalRow = [
    '',
    '',
    '',
    '',
    'TOTAL',
    rows.reduce((s, r) => s + r.msc, 0),
    rows.reduce((s, r) => s + r.employeeShare, 0),
    rows.reduce((s, r) => s + r.employerShare, 0),
    rows.reduce((s, r) => s + r.ec, 0),
    rows.reduce((s, r) => s + r.total, 0),
  ]

  const allData = [...headerData, ...bodyData, [], totalRow]

  const ws = XLSX.utils.aoa_to_sheet(allData)

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 16 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
  ]

  // Merge title
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }]

  XLSX.utils.book_append_sheet(wb, ws, 'SSS R3')

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return buf as ArrayBuffer
}
