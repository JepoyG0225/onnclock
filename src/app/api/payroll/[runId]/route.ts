import { hasLaterPayroll } from '@/lib/payroll/carryover-order'
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

  return prisma.$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
  const current = await tx.payrollRun.findFirst({ where: { id: runId, companyId: ctx.companyId } })
  if (!current) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  if (current.runType === 'FINAL_PAY' || await prisma.payslip.findFirst({where:{payrollRunId:runId,calculationBasis:{path:['kind'],equals:'FINAL_PAY'}},select:{id:true}})) return NextResponse.json({error:'Remove the reviewed final-pay payslip before changing payroll settings.'},{status:409})
  if (current.runType === 'LEAVE_ENCASHMENT') return NextResponse.json({error:'This is a dedicated leave encashment payroll. Cancel the editable batch in Leave Encashment and generate a new batch to revise it.'},{status:409})
  if(current.runType==='THIRTEENTH_MONTH')return NextResponse.json({error:'Delete and regenerate this 13th-month run to change its reviewed inputs.'},{status:409})
  if (await hasLaterPayroll(tx, current)) return NextResponse.json({ error: 'Remove later payrolls first to preserve deduction carryovers.' }, { status: 409 })
  if(await tx.hrOperation.count({where:{companyId:ctx.companyId,kind:'SALARY_CHANGE',status:'APPROVED',data:{path:['retroTargetRunId'],equals:runId}}}))return NextResponse.json({error:'Unschedule attached retro pay in HR Center before changing this payroll period or scope.'},{status:409})
  if (current.computationStartedAt) return NextResponse.json({ error: 'Payroll is being computed' }, { status: 409 })
  if (await tx.leaveEncashment.count({ where: { payrollRunId: runId, status: 'APPROVED' } })) return NextResponse.json({ error: 'Cancel attached leave encashments before changing the payroll period or employee scope' }, { status: 409 })
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

  const loanDeductions = await tx.payslipLoanDeduction.findMany({
    where: { payslip: { payrollRunId: runId } },
    select: { loanId: true, amount: true },
  })
  const restoreByLoan = new Map<string, number>()
  for (const deduction of loanDeductions) {
    restoreByLoan.set(deduction.loanId, (restoreByLoan.get(deduction.loanId) ?? 0) + Number(deduction.amount))
  }

  const saveRun = async () => {
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
  }
  const run = await saveRun()

  logAudit(ctx, 'UPDATE', 'PayrollRun', runId, { description: 'Updated payroll period and employee scope' }).catch(() => {})
  return NextResponse.json({ run })
  }, { timeout: 30000, maxWait: 10000 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  return prisma.$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
  const run = await tx.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
  })

  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })

  if (['LOCKED', 'DISBURSED'].includes(run.status)) {
    return NextResponse.json(
      { error: 'Locked payroll runs cannot be deleted. Contact Super Admin.' },
      { status: 403 }
    )
  }

  if (await hasLaterPayroll(tx, run)) return NextResponse.json({ error: 'Remove later payrolls first to preserve deduction carryovers.' }, { status: 409 })
  if(await tx.hrOperation.count({where:{companyId:ctx.companyId,kind:'SALARY_CHANGE',status:'APPROVED',data:{path:['retroTargetRunId'],equals:runId}}}))return NextResponse.json({error:'Unschedule attached retro pay in HR Center before deleting this payroll.'},{status:409})
  if (run.computationStartedAt) return NextResponse.json({ error: 'Payroll is being computed' }, { status: 409 })
  if (await tx.leaveEncashment.count({ where: { payrollRunId: runId } })) {
    return NextResponse.json({ error: 'Payroll runs with leave encashment history must be retained for audit.' }, { status: 409 })
  }

  // ── Reverse loan balances ──────────────────────────────────────────────
  // The compute step deducted amounts from each EmployeeLoan.balance and
  // possibly marked them FULLY_PAID. If we delete the run without crediting
  // those amounts back, the loan balance silently drops every time HR
  // recomputes the same run. Roll back here.
  const deductions = await tx.payslipLoanDeduction.findMany({
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
    tx.employeeLoan.update({
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

  await Promise.all(restoreOps)
  await tx.payslipLoanDeduction.deleteMany({ where: { payslip: { payrollRunId: runId } } })
  await tx.payslip.deleteMany({ where: { payrollRunId: runId } })
  await tx.payrollDisbursementItem.deleteMany({ where: { disbursement: { payrollRunId: runId } } })
  await tx.payrollDisbursement.deleteMany({ where: { payrollRunId: runId } })
  await tx.thirteenthMonthLog.updateMany({where:{companyId:ctx.companyId,payrollRunId:runId,isPaid:false},data:{payrollRunId:null}})
  await tx.payrollRun.delete({ where: { id: runId } })

  logAudit(ctx, 'DELETE', 'PayrollRun', runId, {
    description: `Deleted payroll run`,
  }).catch(() => {})

  return NextResponse.json({
    success: true,
    loansRestored: restoreByLoan.size,
    totalAmountRestored: parseFloat([...restoreByLoan.values()].reduce((s, n) => s + n, 0).toFixed(2)),
  })
  }, { timeout: 30000, maxWait: 10000 })
}
