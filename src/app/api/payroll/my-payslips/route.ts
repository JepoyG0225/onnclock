import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId },
  })
  if (!employee) return NextResponse.json({ payslips: [] })

  const payslips = await prisma.payslip.findMany({
    where: {
      employeeId: employee.id,
      payrollRun: { status: { in: ['LOCKED', 'APPROVED'] } },
    },
    include: {
      payrollRun: {
        select: { periodLabel: true, periodStart: true, periodEnd: true, payDate: true, status: true },
      },
    },
    orderBy: { payrollRun: { periodStart: 'desc' } },
    take: 24,
  })

  return NextResponse.json({ payslips })
}
