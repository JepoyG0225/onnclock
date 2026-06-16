import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { computePhilHealth } from '@/lib/payroll/philhealth'
import { generatePhilHealthRF1 } from '@/lib/excel/philhealth-rf1'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') ?? '')
  const year  = parseInt(searchParams.get('year') ?? '')
  if (!month || !year) return NextResponse.json({ error: 'month and year required' }, { status: 400 })

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
  })
  if (!company) return NextResponse.json({ error: 'No company' }, { status: 403 })

  // Filter by pay date month — contributions are remitted in the month salary is actually paid.
  const payDateStart = new Date(year, month - 1, 1)
  const payDateEnd   = new Date(year, month, 0, 23, 59, 59)

  const employees = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, isActive: true, philhealthEnabled: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      philhealthNo: true,
      basicSalary: true,
    },
  })

  // Only include employees who received a payslip with philhealth > 0 in this month
  const paidMap = new Map<string, { employeeShare: number; employerShare: number }>(
    (await prisma.payslip.findMany({
      where: {
        employee: { companyId: ctx.companyId, philhealthEnabled: true },
        payrollRun: { payDate: { gte: payDateStart, lte: payDateEnd } },
      },
      select: { employeeId: true, philhealthEmployee: true, philhealthEmployer: true },
    })).reduce((acc, p) => {
      const existing = acc.get(p.employeeId)
      if (existing) {
        existing.employeeShare += Number(p.philhealthEmployee)
        existing.employerShare += Number(p.philhealthEmployer)
      } else {
        acc.set(p.employeeId, {
          employeeShare: Number(p.philhealthEmployee),
          employerShare: Number(p.philhealthEmployer),
        })
      }
      return acc
    }, new Map<string, { employeeShare: number; employerShare: number }>())
  )

  const rows = employees
    .filter(e => {
      const amounts = paidMap.get(e.id)
      return amounts && (amounts.employeeShare > 0 || amounts.employerShare > 0)
    })
    .map(e => {
      const amounts = paidMap.get(e.id)!
      return {
        pin:            e.philhealthNo || '',
        lastName:       e.lastName,
        firstName:      e.firstName,
        middleName:     e.middleName || '',
        basicSalary:    e.basicSalary.toNumber(),
        premiumTotal:   amounts.employeeShare + amounts.employerShare,
        employeeShare:  amounts.employeeShare,
        employerShare:  amounts.employerShare,
      }
    })

  const monthName = new Date(year, month - 1).toLocaleString('en-PH', { month: 'long' })

  if (searchParams.get('format') === 'json') {
    return NextResponse.json({ rows, company: company.name })
  }

  const buf = generatePhilHealthRF1(
    company.name,
    company.philhealthNo || '',
    `${monthName} ${year}`,
    rows
  )

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="PhilHealth-RF1-${year}-${String(month).padStart(2,'0')}.xlsx"`,
    },
  })
}
