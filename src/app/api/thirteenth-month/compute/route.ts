import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

type MonthField = 'janBasic' | 'febBasic' | 'marBasic' | 'aprBasic' | 'mayBasic' | 'junBasic' |
  'julBasic' | 'augBasic' | 'sepBasic' | 'octBasic' | 'novBasic' | 'decBasic'

const MONTH_FIELDS: MonthField[] = [
  'janBasic', 'febBasic', 'marBasic', 'aprBasic', 'mayBasic', 'junBasic',
  'julBasic', 'augBasic', 'sepBasic', 'octBasic', 'novBasic', 'decBasic',
]

interface MonthlyData extends Record<MonthField, number> {
  totalBasicPaid: number
  thirteenthAmount: number
  proRatedMonths: number
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { year } = await req.json()
  const targetYear = year ?? new Date().getFullYear()
  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: {
      thirteenthPayStartMonth: true,
      thirteenthPayStartDay: true,
      thirteenthPayEndMonth: true,
      thirteenthPayEndDay: true,
    },
  })
  const coverageStartMonth = company?.thirteenthPayStartMonth ?? 1
  const coverageStartDay = company?.thirteenthPayStartDay ?? 1
  const coverageEndMonth = company?.thirteenthPayEndMonth ?? 12
  const coverageEndDay = company?.thirteenthPayEndDay ?? 31
  const wrapsAcrossYear =
    coverageStartMonth > coverageEndMonth ||
    (coverageStartMonth === coverageEndMonth && coverageStartDay > coverageEndDay)
  const coverageStartYear = wrapsAcrossYear ? targetYear - 1 : targetYear
  const coverageEndYear = targetYear
  const coverageStart = new Date(Date.UTC(coverageStartYear, coverageStartMonth - 1, coverageStartDay))
  const coverageEnd = new Date(Date.UTC(coverageEndYear, coverageEndMonth - 1, coverageEndDay, 23, 59, 59))

  const employees = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    select: { id: true },
  })

  const results: Array<{ employeeId: string; monthData: MonthlyData }> = []

  for (const emp of employees) {
    const monthData = {} as Record<MonthField, number>

    for (let month = 1; month <= 12; month++) {
      const monthYear = wrapsAcrossYear && month >= coverageStartMonth ? targetYear - 1 : targetYear
      const startDate = new Date(Date.UTC(monthYear, month - 1, 1))
      const lastDay = new Date(Date.UTC(monthYear, month, 0)).getUTCDate()
      const endDate = new Date(Date.UTC(monthYear, month - 1, lastDay, 23, 59, 59))
      if (endDate < coverageStart || startDate > coverageEnd) {
        monthData[MONTH_FIELDS[month - 1]] = 0
        continue
      }
      const windowStart = startDate < coverageStart ? coverageStart : startDate
      const windowEnd = endDate > coverageEnd ? coverageEnd : endDate

      const payslips = await prisma.payslip.findMany({
        where: {
          employeeId: emp.id,
          payrollRun: {
            periodStart: { gte: windowStart },
            periodEnd: { lte: windowEnd },
            status: { in: ['COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED'] },
          },
        },
        select: { basicSalary: true },
      })

      monthData[MONTH_FIELDS[month - 1]] = payslips.reduce((sum, ps) => sum + Number(ps.basicSalary), 0)
    }

    const totalBasicPaid = MONTH_FIELDS.reduce((sum, f) => sum + monthData[f], 0)
    const proRatedMonths = MONTH_FIELDS.filter(f => monthData[f] > 0).length
    const thirteenthAmount = Math.round((totalBasicPaid / 12) * 100) / 100

    results.push({
      employeeId: emp.id,
      monthData: { ...monthData, totalBasicPaid, thirteenthAmount, proRatedMonths },
    })
  }

  await Promise.all(results.map(({ employeeId, monthData }) =>
    prisma.thirteenthMonthLog.upsert({
      where: { employeeId_year: { employeeId, year: targetYear } },
      create: {
        companyId: ctx.companyId,
        employeeId,
        year: targetYear,
        ...monthData,
      },
      update: monthData,
    })
  ))

  return NextResponse.json({
    computed: results.length,
    year: targetYear,
    coverage: {
      start: coverageStart.toISOString(),
      end: coverageEnd.toISOString(),
    },
    totalAmount: results.reduce((sum, r) => sum + r.monthData.thirteenthAmount, 0),
  })
}
