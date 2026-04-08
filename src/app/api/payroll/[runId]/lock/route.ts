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
  if (run.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Payroll must be APPROVED before locking' }, { status: 400 })
  }

  // Lock payroll: update status and update loan balances for deductions
  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    select: {
      id: true,
      employeeId: true,
      sssLoanDeduction: true,
      pagibigLoan: true,
      companyLoan: true,
    },
  })

  await prisma.$transaction(async tx => {
    await tx.payrollRun.update({
      where: { id: runId },
      data: { status: 'LOCKED' },
    })

    // Reduce outstanding loan balances for each employee
    for (const ps of payslips) {
      const totalLoanDeduction =
        ps.sssLoanDeduction.toNumber() +
        ps.pagibigLoan.toNumber() +
        ps.companyLoan.toNumber()

      if (totalLoanDeduction <= 0) continue

      const activeLoans = await tx.employeeLoan.findMany({
        where: { employeeId: ps.employeeId, status: 'ACTIVE' },
        orderBy: { startDate: 'asc' },
      })

      let remaining = totalLoanDeduction
      for (const loan of activeLoans) {
        if (remaining <= 0) break
        const deduct = Math.min(remaining, loan.monthlyAmortization.toNumber(), loan.balance.toNumber())
        const newBalance = loan.balance.toNumber() - deduct

        await tx.employeeLoan.update({
          where: { id: loan.id },
          data: {
            balance: newBalance,
            status: newBalance <= 0 ? 'FULLY_PAID' : 'ACTIVE',
          },
        })

        // Record the deduction
        await tx.payslipLoanDeduction.create({
          data: {
            payslipId: ps.id,
            loanId:    loan.id,
            amount:    deduct,
          },
        })

        remaining -= deduct
      }
    }
  })

  return NextResponse.json({ ok: true, status: 'LOCKED' })
}
