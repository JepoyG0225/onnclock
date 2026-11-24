import type { Prisma } from '@prisma/client'
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
