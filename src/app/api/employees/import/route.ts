import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { Gender, CivilStatus, EmploymentStatus, EmploymentType, RateType, PayFrequency } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

interface ImportError {
  row: number
  employeeNo: string
  error: string
}

/** Parse a date value that may be a YYYY-MM-DD string or an Excel serial number */
function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    // Excel serial date: days since 1899-12-30
    const excelEpoch = new Date(1899, 11, 30)
    const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000)
    if (!isNaN(date.getTime())) return date
    return null
  }

  const str = String(value).trim()
  if (!str) return null

  // Try YYYY-MM-DD
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
    if (!isNaN(d.getTime())) return d
  }

  // Fallback: native parse
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function toEnum<T extends string>(v: unknown, valid: T[], fallback: T): T {
  const s = toStr(v).toUpperCase() as T
  return valid.includes(s) ? s : fallback
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'], req)
  if (error) return error

  const companyId = resolveCompanyIdForRequest(ctx!, req)

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const buffer = Buffer.from(await (file as File).arrayBuffer())
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  } catch {
    return NextResponse.json({ error: 'Could not parse Excel file. Please use the provided template.' }, { status: 400 })
  }

  const wsName = wb.SheetNames.find((n) => n === 'Employees') ?? wb.SheetNames[0]
  const ws = wb.Sheets[wsName]
  if (!ws) {
    return NextResponse.json({ error: 'Could not find "Employees" sheet in the uploaded file.' }, { status: 400 })
  }

  // Convert to array of arrays (raw values)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  // rows[0] = header, rows[1] = sample, rows[2..] = data
  const dataRows = rows.slice(2) // skip header (row 1) and sample (row 2)

  // Pre-fetch departments and positions for this company (for name lookup)
  const [departments, positions] = await Promise.all([
    prisma.department.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
    }),
    prisma.position.findMany({
      where: { companyId, isActive: true },
      select: { id: true, title: true },
    }),
  ])

  const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]))
  const posMap = new Map(positions.map((p) => [p.title.toLowerCase(), p.id]))

  let imported = 0
  let skipped = 0
  const errors: ImportError[] = []

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] as unknown[]
    const rowNumber = i + 3 // 1-based, accounting for header + sample rows

    // Skip completely empty rows
    if (row.every((cell) => toStr(cell) === '')) continue

    // Column mapping (0-indexed):
    // 0  Employee No *
    // 1  Last Name *
    // 2  First Name *
    // 3  Middle Name
    // 4  Gender *
    // 5  Birth Date *
    // 6  Civil Status
    // 7  Personal Email
    // 8  Work Email
    // 9  Mobile No
    // 10 Department
    // 11 Position
    // 12 Employment Status
    // 13 Employment Type
    // 14 Hire Date *
    // 15 Rate Type
    // 16 Basic Salary *
    // 17 Pay Frequency
    // 18 SSS No
    // 19 TIN No
    // 20 PhilHealth No
    // 21 Pag-IBIG No
    // 22 Bank Name
    // 23 Bank Account No

    const employeeNo = toStr(row[0])
    const lastName = toStr(row[1])
    const firstName = toStr(row[2])
    const middleName = toStr(row[3]) || null
    const genderRaw = toStr(row[4])
    const birthDateRaw = row[5]
    const civilStatusRaw = toStr(row[6])
    const personalEmail = toStr(row[7]) || null
    const workEmail = toStr(row[8]) || null
    const mobileNo = toStr(row[9]) || null
    const departmentName = toStr(row[10]).toLowerCase()
    const positionName = toStr(row[11]).toLowerCase()
    const employmentStatusRaw = toStr(row[12])
    const employmentTypeRaw = toStr(row[13])
    const hireDateRaw = row[14]
    const rateTypeRaw = toStr(row[15])
    const basicSalaryRaw = row[16]
    const payFrequencyRaw = toStr(row[17])
    const sssNo = toStr(row[18]) || null
    const tinNo = toStr(row[19]) || null
    const philhealthNo = toStr(row[20]) || null
    const pagibigNo = toStr(row[21]) || null
    const bankName = toStr(row[22]) || null
    const bankAccountNo = toStr(row[23]) || null

    // Skip sample row if it slipped through
    if (employeeNo === 'EMP-001') {
      skipped++
      continue
    }

    // Validate required fields
    const missing: string[] = []
    if (!employeeNo) missing.push('Employee No')
    if (!lastName) missing.push('Last Name')
    if (!firstName) missing.push('First Name')
    if (!genderRaw) missing.push('Gender')
    if (!birthDateRaw && birthDateRaw !== 0) missing.push('Birth Date')
    if (!hireDateRaw && hireDateRaw !== 0) missing.push('Hire Date')
    if (basicSalaryRaw === '' || basicSalaryRaw === null || basicSalaryRaw === undefined) missing.push('Basic Salary')

    if (missing.length > 0) {
      errors.push({ row: rowNumber, employeeNo: employeeNo || '(blank)', error: `Missing required fields: ${missing.join(', ')}` })
      continue
    }

    // Validate gender
    const validGenders: Gender[] = ['MALE', 'FEMALE', 'OTHER']
    const gender = genderRaw.toUpperCase() as Gender
    if (!validGenders.includes(gender)) {
      errors.push({ row: rowNumber, employeeNo, error: `Invalid Gender "${genderRaw}". Must be MALE, FEMALE, or OTHER.` })
      continue
    }

    // Parse dates
    const birthDate = parseDate(birthDateRaw)
    if (!birthDate) {
      errors.push({ row: rowNumber, employeeNo, error: `Invalid Birth Date "${birthDateRaw}". Use YYYY-MM-DD format.` })
      continue
    }

    const hireDate = parseDate(hireDateRaw)
    if (!hireDate) {
      errors.push({ row: rowNumber, employeeNo, error: `Invalid Hire Date "${hireDateRaw}". Use YYYY-MM-DD format.` })
      continue
    }

    // Parse salary
    const basicSalary = Number(basicSalaryRaw)
    if (isNaN(basicSalary) || basicSalary <= 0) {
      errors.push({ row: rowNumber, employeeNo, error: `Invalid Basic Salary "${basicSalaryRaw}". Must be a positive number.` })
      continue
    }

    // Resolve department and position
    const departmentId = departmentName ? (deptMap.get(departmentName) ?? null) : null
    const positionId = positionName ? (posMap.get(positionName) ?? null) : null

    // Resolve enums with defaults
    const civilStatus = toEnum<CivilStatus>(civilStatusRaw, ['SINGLE', 'MARRIED', 'WIDOWED', 'LEGALLY_SEPARATED'], 'SINGLE')
    const employmentStatus = toEnum<EmploymentStatus>(
      employmentStatusRaw,
      ['PROBATIONARY', 'REGULAR', 'CONTRACTUAL', 'PROJECT_BASED', 'PART_TIME', 'RESIGNED', 'TERMINATED', 'RETIRED'],
      'PROBATIONARY'
    )
    const employmentType = toEnum<EmploymentType>(employmentTypeRaw, ['FULL_TIME', 'PART_TIME', 'CONTRACTUAL'], 'FULL_TIME')
    const rateType = toEnum<RateType>(rateTypeRaw, ['MONTHLY', 'DAILY', 'HOURLY'], 'MONTHLY')
    const payFrequency = toEnum<PayFrequency>(payFrequencyRaw, ['SEMI_MONTHLY', 'MONTHLY', 'WEEKLY', 'DAILY'], 'SEMI_MONTHLY')

    try {
      await prisma.employee.create({
        data: {
          companyId,
          employeeNo,
          lastName,
          firstName,
          middleName,
          gender,
          birthDate,
          civilStatus,
          personalEmail,
          workEmail,
          mobileNo,
          departmentId,
          positionId,
          employmentStatus,
          employmentType,
          hireDate,
          rateType,
          basicSalary: new Decimal(basicSalary),
          payFrequency,
          sssNo,
          tinNo,
          philhealthNo,
          pagibigNo,
          bankName,
          bankAccountNo,
        },
      })
      imported++
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      // P2002 = unique constraint violation (duplicate employeeNo)
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
        skipped++
      } else {
        errors.push({ row: rowNumber, employeeNo, error: errMsg.slice(0, 200) })
      }
    }
  }

  return NextResponse.json({ imported, skipped, errors })
}
