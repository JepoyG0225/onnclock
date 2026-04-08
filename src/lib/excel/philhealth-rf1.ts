/**
 * PhilHealth RF-1 — Premium Remittance Return
 * Monthly PhilHealth premium contributions per employee
 */
import * as XLSX from 'xlsx'

export interface PhilHealthRF1Row {
  pin: string          // PhilHealth Identification Number
  lastName: string
  firstName: string
  middleName: string
  basicSalary: number
  premiumTotal: number   // 5% of salary (both shares)
  employeeShare: number  // 2.5%
  employerShare: number  // 2.5%
}

export function generatePhilHealthRF1(
  companyName: string,
  erNo: string,          // Employer PhilHealth number
  month: string,
  rows: PhilHealthRF1Row[]
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  const headerData = [
    ['PHILHEALTH FORM RF-1 — PREMIUM REMITTANCE RETURN'],
    [`Employer Name: ${companyName}`],
    [`Employer PhilHealth No.: ${erNo}`],
    [`Reference Month: ${month}`],
    [],
    [
      'PhilHealth No. (PIN)',
      'Last Name',
      'First Name',
      'Middle Name',
      'Basic Salary',
      'Premium Total (5%)',
      'EE Share (2.5%)',
      'ER Share (2.5%)',
    ],
  ]

  const bodyData = rows.map(r => [
    r.pin || '',
    r.lastName,
    r.firstName,
    r.middleName || '',
    r.basicSalary,
    r.premiumTotal,
    r.employeeShare,
    r.employerShare,
  ])

  const totalRow = [
    '',
    '',
    '',
    'TOTAL',
    rows.reduce((s, r) => s + r.basicSalary, 0),
    rows.reduce((s, r) => s + r.premiumTotal, 0),
    rows.reduce((s, r) => s + r.employeeShare, 0),
    rows.reduce((s, r) => s + r.employerShare, 0),
  ]

  const allData = [...headerData, ...bodyData, [], totalRow]
  const ws = XLSX.utils.aoa_to_sheet(allData)

  ws['!cols'] = [
    { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 16 },
    { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
  ]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }]

  XLSX.utils.book_append_sheet(wb, ws, 'RF-1')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
