import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
  })

  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })

  if (run.status === 'LOCKED') {
    return NextResponse.json(
      { error: 'Locked payroll runs cannot be deleted. Contact Super Admin.' },
      { status: 403 }
    )
  }

  // ── Reverse loan balances ──────────────────────────────────────────────
  // The compute step deducted amounts from each EmployeeLoan.balance and
  // possibly marked them FULLY_PAID. If we delete the run without crediting
  // those amounts back, the loan balance silently drops every time HR
  // recomputes the same run. Roll back here.
  const deductions = await prisma.payslipLoanDeduction.findMany({
    where: { payslip: { payrollRunId: runId } },
    select: { loanId: true, amount: true },
  })
  const restoreByLoan = new Map<string, number>()
  for (const d of deductions) {
    const prev = restoreByLoan.get(d.loanId) ?? 0
    restoreByLoan.set(d.loanId, prev + Number(d.amount))
  }

  // ── Atomic cleanup ─────────────────────────────────────────────────────
  // 1. Credit each loan back by the amount it was debited on this run
  //    and flip any FULLY_PAID-by-this-run loan back to ACTIVE.
  // 2. Delete ledger rows (PayslipLoanDeduction), payslips, then the run.
  const restoreOps = [...restoreByLoan.entries()].map(([loanId, amount]) =>
    prisma.employeeLoan.update({
      where: { id: loanId },
      data: {
        balance: { increment: amount },
        // If the loan was marked FULLY_PAID by this run we don't know for
        // certain without re-checking, so just reactivate it. The next
        // compute will set status accordingly.
        status: 'ACTIVE',
        endDate: null,
      },
    }),
  )

  await prisma.$transaction([
    ...restoreOps,
    prisma.payslipLoanDeduction.deleteMany({
      where: { payslip: { payrollRunId: runId } },
    }),
    prisma.payslip.deleteMany({ where: { payrollRunId: runId } }),
    prisma.payrollRun.delete({ where: { id: runId } }),
  ])

  return NextResponse.json({
    success: true,
    loansRestored: restoreByLoan.size,
    totalAmountRestored: parseFloat([...restoreByLoan.values()].reduce((s, n) => s + n, 0).toFixed(2)),
  })
}
