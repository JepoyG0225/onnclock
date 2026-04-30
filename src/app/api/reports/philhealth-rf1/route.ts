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
    where: { companyId: ctx.companyId, isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      philhealthNo: true,
      basicSalary: true,
    },
  })

  // Only include employees who received a payslip with a pay date in this month
  const paidIds = new Set(
    (await prisma.payslip.findMany({
      where: {
        employee: { companyId: ctx.companyId },
        payrollRun: {
          payDate: { gte: payDateStart, lte: payDateEnd },
        },
      },
      select: { employeeId: true },
      distinct: ['employeeId'],
    })).map(p => p.employeeId)
  )

  const rows = employees
    .filter(e => paidIds.has(e.id))
    .map(e => {
      const ph = computePhilHealth(e.basicSalary.toNumber())
      return {
        pin:            e.philhealthNo || '',
        lastName:       e.lastName,
        firstName:      e.firstName,
        middleName:     e.middleName || '',
        basicSalary:    e.basicSalary.toNumber(),
        premiumTotal:   ph.total,
        employeeShare:  ph.employeeShare,
        employerShare:  ph.employerShare,
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
