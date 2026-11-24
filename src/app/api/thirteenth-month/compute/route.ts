import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { z } from 'zod'
import { earnedBasicPay } from '@/lib/payroll/monthly-pay'
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

  if (!await ctxHasPermission(ctx,'payroll:write')) return NextResponse.json({error:'Payroll write access is required.'},{status:403})
  const parsed=z.object({year:z.number().int().min(2000).max(2100)}).safeParse(await req.json().catch(()=>null))
  if(!parsed.success)return NextResponse.json({error:'Select a valid year.'},{status:422})
  const targetYear=parsed.data.year
  const existingLogs=await prisma.thirteenthMonthLog.findMany({where:{companyId:ctx.companyId,year:targetYear}})
  if(existingLogs.some(l=>l.payrollRunId&&!l.isPaid))return NextResponse.json({error:'A generated payroll already uses these amounts. Delete the unpaid editable run before recomputing.'},{status:409})
  const paidIds=new Set(existingLogs.filter(l=>l.isPaid).map(l=>l.employeeId))
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
    if(paidIds.has(emp.id))continue
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
            runType: 'REGULAR',
            // Assign a cutoff to its ending month so cross-month cutoffs are counted once.
            periodEnd: { gte: windowStart, lte: windowEnd },
            status: { in: ['COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED', 'DISBURSED'] },
          },
        },
        select: { basicSalary: true, absenceDeduction: true, lateDeduction: true, undertimeDeduction: true, calculationBasis: true },
      })

      monthData[MONTH_FIELDS[month - 1]] = payslips.reduce((sum, ps) => sum + earnedBasicPay(ps), 0)
    }

    const totalBasicPaid = MONTH_FIELDS.reduce((sum, f) => sum + monthData[f], 0)
    const proRatedMonths = MONTH_FIELDS.filter(f => monthData[f] > 0).length
    const thirteenthAmount = Math.round((totalBasicPaid / 12) * 100) / 100

    results.push({
      employeeId: emp.id,
      monthData: { ...monthData, totalBasicPaid, thirteenthAmount, proRatedMonths },
    })
  }

  const saved=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
    if(await tx.thirteenthMonthLog.count({where:{companyId:ctx.companyId,year:targetYear,payrollRunId:{not:null},isPaid:false}}))return false
    if(await tx.thirteenthMonthLog.count({where:{companyId:ctx.companyId,year:targetYear,employeeId:{in:results.map(r=>r.employeeId)},isPaid:true}}))return false
  await Promise.all(results.map(({ employeeId, monthData }) =>
    tx.thirteenthMonthLog.upsert({
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
    return true
  },{timeout:60000,maxWait:10000})
  if(!saved)return NextResponse.json({error:'Payment state changed during computation. Refresh the page.'},{status:409})

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
