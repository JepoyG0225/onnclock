import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!['COMPANY_ADMIN', 'SUPER_ADMIN'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
  })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  if (run.status !== 'LOCKED') {
    return NextResponse.json({ error: 'Only LOCKED payroll runs can be unlocked' }, { status: 400 })
  }

  await prisma.$transaction(async tx => {
    const deductions = await tx.payslipLoanDeduction.findMany({
      where: { payslip: { payrollRunId: runId } },
      select: { id: true, loanId: true, amount: true },
    })

    for (const d of deductions) {
      const loan = await tx.employeeLoan.findUnique({ where: { id: d.loanId } })
      if (!loan) continue
      const newBalance = loan.balance.toNumber() + d.amount.toNumber()
      await tx.employeeLoan.update({
        where: { id: d.loanId },
        data: {
          balance: newBalance,
          status: newBalance > 0 ? 'ACTIVE' : 'FULLY_PAID',
        },
      })
    }

    await tx.payslipLoanDeduction.deleteMany({
      where: { payslip: { payrollRunId: runId } },
    })

    await tx.payrollRun.update({
      where: { id: runId },
      data: { status: 'APPROVED' },
    })
  })

  return NextResponse.json({ ok: true, status: 'APPROVED' })
}
