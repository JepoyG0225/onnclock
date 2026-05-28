import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { computePagIBIG } from '@/lib/payroll/pagibig'
import { generatePagIBIGMCRF } from '@/lib/excel/pagibig-mcrf'

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
    where: { companyId: ctx.companyId, isActive: true, pagibigEnabled: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      pagibigNo: true,
      basicSalary: true,
    },
  })

  // Only include employees who received a payslip with pagibig > 0 in this month
  const paidMap = new Map<string, { employeeShare: number; employerShare: number }>(
    (await prisma.payslip.findMany({
      where: {
        employee: { companyId: ctx.companyId, pagibigEnabled: true },
        payrollRun: { payDate: { gte: payDateStart, lte: payDateEnd } },
      },
      select: { employeeId: true, pagibigEmployee: true, pagibigEmployer: true },
    })).reduce((acc, p) => {
      const existing = acc.get(p.employeeId)
      if (existing) {
        existing.employeeShare += Number(p.pagibigEmployee)
        existing.employerShare += Number(p.pagibigEmployer)
      } else {
        acc.set(p.employeeId, {
          employeeShare: Number(p.pagibigEmployee),
          employerShare: Number(p.pagibigEmployer),
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
        memberId:          e.pagibigNo || '',
        lastName:          e.lastName,
        firstName:         e.firstName,
        middleName:        e.middleName || '',
        basicSalary:       e.basicSalary.toNumber(),
        employeeShare:     amounts.employeeShare,
        employerShare:     amounts.employerShare,
        totalContribution: amounts.employeeShare + amounts.employerShare,
      }
    })

  const monthName = new Date(year, month - 1).toLocaleString('en-PH', { month: 'long' })

  if (searchParams.get('format') === 'json') {
    return NextResponse.json({ rows })
  }

  const buf = generatePagIBIGMCRF(
    company.name,
    company.pagibigNo || '',
    `${monthName} ${year}`,
    rows
  )

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="PagIBIG-MCRF-${year}-${String(month).padStart(2,'0')}.xlsx"`,
    },
  })
}
