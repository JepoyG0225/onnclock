import type { Prisma } from '@prisma/client'
import { readDeductionCarryover } from './deduction-carryover'
export async function hasLaterPayroll(tx: Prisma.TransactionClient, run: { id: string; companyId: string; payDate: Date; periodEnd: Date; createdAt: Date; runType?: string }) {
  if(['THIRTEENTH_MONTH','LEAVE_ENCASHMENT','FINAL_PAY'].includes(run.runType??''))return false
  const employees = await tx.payslip.findMany({ where: { payrollRunId: run.id }, select: { employeeId: true } })
  if (!employees.length) return false
  return !!await tx.payslip.findFirst({ where: {
    employeeId: { in: employees.map(e => e.employeeId) }, payrollRun: {
      runType: 'REGULAR', companyId: run.companyId, id: { not: run.id }, status: { in: ['COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED', 'DISBURSED'] },
      OR: [
        { payDate: { gt: run.payDate } },
        { payDate: run.payDate, periodEnd: { gt: run.periodEnd } },
        { payDate: run.payDate, periodEnd: run.periodEnd, createdAt: { gt: run.createdAt } },
      ],
    },
  }, select: { id: true } })
}


type PayrollOrder = { id: string; companyId: string; payDate: Date; periodEnd: Date; createdAt: Date; runType?: string }

// This must match the predecessor ordering used by payroll computation.
function comparePayrolls(a: PayrollOrder, b: PayrollOrder) {
  return a.payDate.getTime() - b.payDate.getTime()
    || a.periodEnd.getTime() - b.periodEnd.getTime()
    || a.createdAt.getTime() - b.createdAt.getTime()
}

function deferredSignature(basis: unknown) {
  const carry = readDeductionCarryover(basis)
  // Legacy and final-pay snapshots have no carryover, just as in compute.
  const loans = (carry?.loans ?? [])
    .filter(loan => loan.deferred > 0)
    .map(loan => [loan.id, Math.round(loan.deferred * 100)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify([Math.round((carry?.otherDeferred ?? 0) * 100), loans])
}

/** Deletion may reconnect the next payslip to an older predecessor. Block only
 * when that changes its incoming deferred deductions, not merely its existence.
 * Editing/recomputation still uses the stricter guard: it can introduce new debt.
 */
export async function findPayrollDeletionBlocker(tx: Prisma.TransactionClient, run: PayrollOrder) {
  if (['THIRTEENTH_MONTH', 'LEAVE_ENCASHMENT', 'FINAL_PAY'].includes(run.runType ?? '')) return null
  const current = await tx.payslip.findMany({
    where: { payrollRunId: run.id, payrollRun: { companyId: run.companyId } },
    select: { employeeId: true, calculationBasis: true },
  })
  if (!current.length) return null
  const related = await tx.payslip.findMany({
    where: {
      employeeId: { in: current.map(p => p.employeeId) },
      payrollRun: {
        companyId: run.companyId, id: { not: run.id }, runType: 'REGULAR',
        status: { in: ['COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED', 'DISBURSED'] },
      },
    },
    select: {
      employeeId: true, calculationBasis: true,
      payrollRun: { select: { id: true, companyId: true, periodLabel: true, status: true, payDate: true, periodEnd: true, createdAt: true } },
    },
    orderBy: [{ payrollRun: { payDate: 'asc' } }, { payrollRun: { periodEnd: 'asc' } }, { payrollRun: { createdAt: 'asc' } }],
  })
  for (const slip of current) {
    const chain = related.filter(p => p.employeeId === slip.employeeId)
    const next = chain.find(p => comparePayrolls(p.payrollRun, run) > 0)
    if (!next) continue
    const previous = chain.filter(p => comparePayrolls(p.payrollRun, run) < 0).at(-1)
    if (deferredSignature(slip.calculationBasis) !== deferredSignature(previous?.calculationBasis)) {
      return { id: next.payrollRun.id, periodLabel: next.payrollRun.periodLabel, status: next.payrollRun.status }
    }
  }
  return null
}
