import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { computeSSS } from '@/lib/payroll/sss'
import { generateSSSR3 } from '@/lib/excel/sss-r3'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') ?? '')   // 1-12
  const year  = parseInt(searchParams.get('year') ?? '')

  if (!month || !year) {
    return NextResponse.json({ error: 'month and year are required' }, { status: 400 })
  }

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
  })
  if (!company) return NextResponse.json({ error: 'No company' }, { status: 403 })

  // Get all payslips whose pay date falls within the selected month.
  // Contributions are remitted based on the month the salary is actually paid,
  // not the coverage period (e.g. Feb 16–28 paid on Mar 15 → March remittance).
  const payDateStart = new Date(year, month - 1, 1)
  const payDateEnd   = new Date(year, month, 0, 23, 59, 59)

  const payslips = await prisma.payslip.findMany({
    where: {
      employee: { companyId: ctx.companyId },
      payrollRun: {
        payDate: { gte: payDateStart, lte: payDateEnd },
      },
    },
    include: {
      employee: {
        select: {
          employeeNo: true,
          firstName: true,
          lastName: true,
          middleName: true,
          sssNo: true,
          basicSalary: true,
        },
      },
    },
  })

  // Aggregate by employee
  const map = new Map<string, typeof payslips[number]>()
  for (const ps of payslips) {
    if (!map.has(ps.employeeId)) {
      map.set(ps.employeeId, { ...ps })
    }
    // Just take the first payslip's SSS amounts (they're monthly, not doubled)
  }

  const rows = Array.from(map.values()).map(ps => {
    const sss = computeSSS(ps.employee.basicSalary.toNumber())
    return {
      employeeNo:     ps.employee.employeeNo || '',
      sssNo:          ps.employee.sssNo || '',
      lastName:       ps.employee.lastName,
      firstName:      ps.employee.firstName,
      middleName:     ps.employee.middleName || '',
      msc:            sss.msc,
      employeeShare:  sss.employeeShare,
      employerShare:  sss.employerShare,
      ec:             sss.ec,
      total:          sss.total,
    }
  })

  const monthName = new Date(year, month - 1).toLocaleString('en-PH', { month: 'long' })

  if (searchParams.get('format') === 'json') {
    return NextResponse.json({ rows, company: company.name, month: `${monthName} ${year}` })
  }

  const buf = generateSSSR3(company.name, `${monthName} ${year}`, year, rows)

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="SSS-R3-${year}-${String(month).padStart(2,'0')}.xlsx"`,
    },
  })
}
