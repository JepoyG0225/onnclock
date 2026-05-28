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
      employee: { companyId: ctx.companyId, sssEnabled: true },
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
          sssEnabled: true,
        },
      },
    },
  })

  // Aggregate by employee — sum SSS across multiple payslips in the month
  const map = new Map<string, { ps: typeof payslips[number]; employeeShare: number; employerShare: number; ec: number }>()
  for (const ps of payslips) {
    const existing = map.get(ps.employeeId)
    if (existing) {
      existing.employeeShare += Number(ps.sssEc)          // employee share stored in sssEc field
      existing.employerShare += Number(ps.sssEmployer)
      existing.ec            += Number(ps.sssEc)
    } else {
      map.set(ps.employeeId, {
        ps,
        employeeShare: Number(ps.sssEc),
        employerShare: Number(ps.sssEmployer),
        ec:            Number(ps.sssEc),
      })
    }
  }

  const rows = Array.from(map.values())
    .filter(({ employeeShare, employerShare }) => employeeShare > 0 || employerShare > 0)
    .map(({ ps, employeeShare, employerShare, ec }) => {
      const sss = computeSSS(ps.employee.basicSalary.toNumber())
      return {
        employeeNo:     ps.employee.employeeNo || '',
        sssNo:          ps.employee.sssNo || '',
        lastName:       ps.employee.lastName,
        firstName:      ps.employee.firstName,
        middleName:     ps.employee.middleName || '',
        msc:            sss.msc,
        employeeShare,
        employerShare,
        ec,
        total:          employeeShare + employerShare,
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
