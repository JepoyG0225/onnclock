import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireAuth } from '@/lib/api-auth'

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Employees ────────────────────────────────────────────────────
  const headers = [
    'Employee No *',
    'Last Name *',
    'First Name *',
    'Middle Name',
    'Gender * (MALE/FEMALE/OTHER)',
    'Birth Date * (YYYY-MM-DD)',
    'Civil Status (SINGLE/MARRIED/WIDOWED/LEGALLY_SEPARATED)',
    'Personal Email',
    'Work Email',
    'Mobile No',
    'Department (name)',
    'Position (name)',
    'Employment Status (PROBATIONARY/REGULAR/CONTRACTUAL/PROJECT_BASED/PART_TIME)',
    'Employment Type (FULL_TIME/PART_TIME/CONTRACTUAL)',
    'Hire Date * (YYYY-MM-DD)',
    'Rate Type (MONTHLY/DAILY/HOURLY)',
    'Basic Salary *',
    'Pay Frequency (SEMI_MONTHLY/MONTHLY/WEEKLY/DAILY)',
    'SSS No',
    'TIN No',
    'PhilHealth No',
    'Pag-IBIG No',
    'Bank Name',
    'Bank Account No',
  ]

  const sampleRow = [
    'EMP-001',
    'Dela Cruz',
    'Juan',
    'Santos',
    'MALE',
    '1990-01-15',
    'SINGLE',
    'juan@personal.com',
    'juan@company.com',
    '09171234567',
    'Engineering',
    'Software Engineer',
    'REGULAR',
    'FULL_TIME',
    '2023-03-01',
    'MONTHLY',
    30000,
    'SEMI_MONTHLY',
    '12-3456789-0',
    '123-456-789-000',
    '12-345678901-2',
    '1234-5678-9012',
    'BDO',
    '00123456789',
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow])

  // Style header row: navy background (#000000), white bold text
  const navyFill = { patternType: 'solid', fgColor: { rgb: '162d54' } }
  const whiteFont = { bold: true, color: { rgb: 'FFFFFF' } }

  for (let col = 0; col < headers.length; col++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: col })
    if (!ws[cellAddr]) ws[cellAddr] = {}
    ws[cellAddr].s = {
      fill: navyFill,
      font: whiteFont,
      alignment: { wrapText: true, vertical: 'center' },
    }
  }

  // Auto column widths based on header length (min 15, max 40)
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(40, Math.max(15, h.length + 2)) }))

  XLSX.utils.book_append_sheet(wb, ws, 'Employees')

  // ── Sheet 2: Instructions ─────────────────────────────────────────────────
  const instructions = [
    ['Employee Import Instructions'],
    [''],
    ['REQUIRED FIELDS (marked with * in header):'],
    ['  - Employee No: Unique identifier (e.g. EMP-001)'],
    ['  - Last Name'],
    ['  - First Name'],
    ['  - Gender: Must be MALE, FEMALE, or OTHER'],
    ['  - Birth Date: Format YYYY-MM-DD (e.g. 1990-01-15)'],
    ['  - Hire Date: Format YYYY-MM-DD (e.g. 2023-03-01)'],
    ['  - Basic Salary: Numeric value in PHP (e.g. 30000)'],
    [''],
    ['VALID ENUM VALUES:'],
    ['  Gender:             MALE | FEMALE | OTHER'],
    ['  Civil Status:       SINGLE | MARRIED | WIDOWED | LEGALLY_SEPARATED'],
    ['  Employment Status:  PROBATIONARY | REGULAR | CONTRACTUAL | PROJECT_BASED | PART_TIME'],
    ['  Employment Type:    FULL_TIME | PART_TIME | CONTRACTUAL'],
    ['  Rate Type:          MONTHLY | DAILY | HOURLY'],
    ['  Pay Frequency:      SEMI_MONTHLY | MONTHLY | WEEKLY | DAILY'],
    [''],
    ['NOTES:'],
    ['  - Row 2 (sample data) is automatically skipped during import.'],
    ['  - Department and Position must match existing names in the system (case-insensitive).'],
    ['  - If Department or Position is not found, it will be left blank.'],
    ['  - Duplicate Employee No records will be skipped.'],
    ['  - Defaults applied when optional fields are blank:'],
    ['      Civil Status     → SINGLE'],
    ['      Employment Status → PROBATIONARY'],
    ['      Employment Type  → FULL_TIME'],
    ['      Rate Type        → MONTHLY'],
    ['      Pay Frequency    → SEMI_MONTHLY'],
  ]

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions)
  wsInstructions['!cols'] = [{ wch: 80 }]

  // Bold the title cell
  if (wsInstructions['A1']) {
    wsInstructions['A1'].s = { font: { bold: true, sz: 14 } }
  }

  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions')

  // Write workbook to buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="employee_import_template.xlsx"',
    },
  })
}
