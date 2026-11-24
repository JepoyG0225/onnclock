import type { Prisma } from '@prisma/client'

/** Called inside the tenant-scoped, locked employee transaction. Cascades handle
 * owned documents, activities, learning records and other dependent children. */
export async function deleteEmployeePermanently(tx: Prisma.TransactionClient, employee: { id: string; companyId: string; userId: string | null }) {
  const { id, companyId, userId } = employee
  const runs = await tx.payrollRun.findMany({ where: { companyId, OR: [{ payslips: { some: { employeeId: id } } }, { employeeIds: { has: id } }] }, select: { id: true, employeeIds: true } })
  await tx.payslipLoanDeduction.deleteMany({ where: { OR: [{ payslip: { employeeId: id } }, { loan: { employeeId: id } }] } })
  await tx.leaveEncashment.deleteMany({ where: { balance: { employeeId: id } } })
  await tx.cashAdvanceRequest.updateMany({ where: { loan: { employeeId: id } }, data: { linkedLoanId: null } })
  await tx.payslip.deleteMany({ where: { employeeId: id } })
  await tx.employeeLoan.deleteMany({ where: { employeeId: id } })
  await tx.leaveBalance.deleteMany({ where: { employeeId: id } })
  await tx.leaveRequest.deleteMany({ where: { employeeId: id } })
  await tx.dTRRecord.deleteMany({ where: { employeeId: id } })
  await tx.overtimeRecord.deleteMany({ where: { employeeId: id } })
  await tx.deMinimisItem.deleteMany({ where: { employeeId: id } })
  await tx.taxExemption.deleteMany({ where: { employeeId: id } })
  await tx.thirteenthMonthLog.deleteMany({ where: { employeeId: id } })
  await tx.budgetRequisition.deleteMany({ where: { employeeId: id } })
  await tx.timeEntryCorrection.deleteMany({ where: { employeeId: id } })
  await tx.employee.delete({ where: { id } })
  for (const run of runs) {
    const totals = await tx.payslip.aggregate({ where: { payrollRunId: run.id }, _sum: { basicSalary: true, grossPay: true, totalDeductions: true, netPay: true, sssEmployer: true, philhealthEmployer: true, pagibigEmployer: true } })
    await tx.payrollRun.update({ where: { id: run.id }, data: {
      employeeIds: run.employeeIds.filter(value => value !== id),
      totalBasic: totals._sum.basicSalary ?? 0, totalGross: totals._sum.grossPay ?? 0,
      totalDeductions: totals._sum.totalDeductions ?? 0, totalNetPay: totals._sum.netPay ?? 0,
      totalSssEr: totals._sum.sssEmployer ?? 0, totalPhEr: totals._sum.philhealthEmployer ?? 0, totalPagibigEr: totals._sum.pagibigEmployer ?? 0,
    } })
  }
  if (userId && !await tx.employee.count({ where: { userId, companyId } })) {
    // A shared login may have admin access or belong to another company.
    const membership = await tx.userCompany.updateMany({ where: { userId, companyId, role: 'EMPLOYEE' }, data: { isActive: false } })
    if (membership.count) await tx.notification.deleteMany({ where: { userId, companyId } })
  }
}
