import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId },
  })
  if (!employee) return NextResponse.json({ payslips: [] })

  const payslips = await prisma.payslip.findMany({
    where: {
      employeeId: employee.id,
      payrollRun: { status: { in: ['APPROVED', 'LOCKED'] } },
    },
    include: {
      payrollRun: {
        select: { periodLabel: true, periodStart: true, periodEnd: true, payDate: true, status: true },
      },
      incomes: {
        select: { typeName: true, amount: true },
      },
    },
    orderBy: { payrollRun: { periodStart: 'desc' } },
    take: 24,
  })

  // Active "other deduction" line items for this employee — used to itemize the
  // Other Deductions total on the payslip. Guarded so a not-yet-migrated table
  // can't break the payslip list.
  let otherDeductionItems: { label: string; amount: number }[] = []
  try {
    const rows = await prisma.employeeOtherDeduction.findMany({
      where: { employeeId: employee.id, isActive: true },
      select: { label: true, amount: true },
      orderBy: { createdAt: 'asc' },
    })
    otherDeductionItems = rows.map(r => ({ label: r.label, amount: Number(r.amount) }))
  } catch {
    otherDeductionItems = []
  }

  return NextResponse.json({ payslips, otherDeductionItems })
}
