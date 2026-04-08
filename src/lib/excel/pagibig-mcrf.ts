/**
 * Pag-IBIG MCRF — Modified Collection and Remittance Form
 * Monthly Pag-IBIG contributions (employee + employer)
 */
import * as XLSX from 'xlsx'

export interface PagIBIGMCRFRow {
  memberId: string       // Pag-IBIG MID Number
  lastName: string
  firstName: string
  middleName: string
  basicSalary: number
  employeeShare: number
  employerShare: number
  totalContribution: number
}

export function generatePagIBIGMCRF(
  companyName: string,
  employerId: string,
  month: string,
  rows: PagIBIGMCRFRow[]
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  const headerData = [
    ['PAG-IBIG / HDMF MCRF — MODIFIED COLLECTION AND REMITTANCE FORM'],
    [`Employer Name: ${companyName}`],
    [`Employer MID No.: ${employerId}`],
    [`Reference Month: ${month}`],
    [],
    [
      'MID Number',
      'Last Name',
      'First Name',
      'Middle Name',
      'Basic Salary',
      'EE Share',
      'ER Share',
      'Total',
    ],
  ]

  const bodyData = rows.map(r => [
    r.memberId || '',
    r.lastName,
    r.firstName,
    r.middleName || '',
    r.basicSalary,
    r.employeeShare,
    r.employerShare,
    r.totalContribution,
  ])

  const totalRow = [
    '',
    '',
    '',
    'TOTAL',
    rows.reduce((s, r) => s + r.basicSalary, 0),
    rows.reduce((s, r) => s + r.employeeShare, 0),
    rows.reduce((s, r) => s + r.employerShare, 0),
    rows.reduce((s, r) => s + r.totalContribution, 0),
  ]

  const allData = [...headerData, ...bodyData, [], totalRow]
  const ws = XLSX.utils.aoa_to_sheet(allData)

  ws['!cols'] = [
    { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 16 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  ]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }]

  XLSX.utils.book_append_sheet(wb, ws, 'MCRF')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
