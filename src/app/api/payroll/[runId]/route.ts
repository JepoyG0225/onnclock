import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { getPeriodLabel } from '@/lib/utils'
import { z } from 'zod'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'

const updateRunSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  payDate: z.string(),
  payFrequency: z.enum(['SEMI_MONTHLY', 'MONTHLY', 'WEEKLY', 'DAILY']),
  notes: z.string().optional(),
  payGroupLabel: z.string().trim().max(120).optional(),
  employeeScopeMode: z.enum(['ALL', 'EMPLOYMENT_TYPE', 'CUSTOM']),
  employmentTypeFilter: z.array(z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACTUAL'])).default([]),
  employeeIds: z.array(z.string().min(1)).default([]),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const { runId } = await params
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId: ctx.companyId } })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  return NextResponse.json({ run })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!(await ctxHasPermission(ctx, 'payroll:write'))) {
    return NextResponse.json({ error: 'You do not have access to edit payroll periods' }, { status: 403 })
  }
  const { runId } = await params
  const parsed = updateRunSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payroll period details', details: parsed.error.flatten() }, { status: 422 })

  const current = await prisma.payrollRun.findFirst({ where: { id: runId, companyId: ctx.companyId } })
  if (!current) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  if (!['DRAFT', 'COMPUTED'].includes(current.status)) {
    return NextResponse.json({ error: 'Only draft or computed payroll runs can return to Payroll Period' }, { status: 400 })
  }

  const data = parsed.data
  if (data.employeeScopeMode === 'EMPLOYMENT_TYPE' && data.employmentTypeFilter.length === 0) {
    return NextResponse.json({ error: 'Select at least one employment type' }, { status: 422 })
  }
  if (data.employeeScopeMode === 'CUSTOM' && data.employeeIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one employee' }, { status: 422 })
  }
  const periodStart = new Date(data.periodStart)
  const periodEnd = new Date(data.periodEnd)
  const payDate = new Date(data.payDate)
  if ([periodStart, periodEnd, payDate].some(date => Number.isNaN(date.getTime())) || periodStart > periodEnd) {
    return NextResponse.json({ error: 'Invalid payroll period or pay date' }, { status: 422 })
  }

  const loanDeductions = await prisma.payslipLoanDeduction.findMany({
    where: { payslip: { payrollRunId: runId } },
    select: { loanId: true, amount: true },
  })
  const restoreByLoan = new Map<string, number>()
  for (const deduction of loanDeductions) {
    restoreByLoan.set(deduction.loanId, (restoreByLoan.get(deduction.loanId) ?? 0) + Number(deduction.amount))
  }

  const run = await prisma.$transaction(async tx => {
    for (const [loanId, amount] of restoreByLoan) {
      await tx.employeeLoan.update({ where: { id: loanId }, data: { balance: { increment: amount }, status: 'ACTIVE', endDate: null } })
    }
    await tx.payslipLoanDeduction.deleteMany({ where: { payslip: { payrollRunId: runId } } })
    await tx.payslip.deleteMany({ where: { payrollRunId: runId } })
    await tx.payrollRunIncomeEntry.deleteMany({ where: { payrollRunId: runId } })
    return tx.payrollRun.update({
      where: { id: runId },
      data: {
        periodLabel: getPeriodLabel(periodStart, periodEnd), periodStart, periodEnd, payDate,
        payFrequency: data.payFrequency,
        notes: data.notes || null,
        payGroupLabel: data.payGroupLabel || null,
        employeeScopeMode: data.employeeScopeMode,
        employmentTypeFilter: data.employeeScopeMode === 'EMPLOYMENT_TYPE' ? data.employmentTypeFilter : [],
        employeeIds: data.employeeScopeMode === 'CUSTOM' ? data.employeeIds : [],
        status: 'DRAFT', approvalLevel: 0, approvalTrail: [],
        totalBasic: 0, totalGross: 0, totalDeductions: 0, totalNetPay: 0,
        totalSssEr: 0, totalPhEr: 0, totalPagibigEr: 0,
      },
    })
  })

  logAudit(ctx, 'UPDATE', 'PayrollRun', runId, { description: 'Updated payroll period and employee scope' }).catch(() => {})
  return NextResponse.json({ run })
}

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
    // Delete disbursement items first (no cascade from run → disbursement in schema)
    prisma.payrollDisbursementItem.deleteMany({
      where: { disbursement: { payrollRunId: runId } },
    }),
    prisma.payrollDisbursement.deleteMany({ where: { payrollRunId: runId } }),
    prisma.payrollRun.delete({ where: { id: runId } }),
  ])

  logAudit(ctx, 'DELETE', 'PayrollRun', runId, {
    description: `Deleted payroll run`,
  }).catch(() => {})

  return NextResponse.json({
    success: true,
    loansRestored: restoreByLoan.size,
    totalAmountRestored: parseFloat([...restoreByLoan.values()].reduce((s, n) => s + n, 0).toFixed(2)),
  })
}
