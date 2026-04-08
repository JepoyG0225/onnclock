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

  // Get all payslips for the month (aggregate by employee — sum both cutoffs)
  const periodStart = new Date(year, month - 1, 1)
  const periodEnd   = new Date(year, month, 0, 23, 59, 59)

  const payslips = await prisma.payslip.findMany({
    where: {
      employee: { companyId: ctx.companyId },
      payrollRun: {
        periodStart: { gte: periodStart },
        periodEnd:   { lte: periodEnd },
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
