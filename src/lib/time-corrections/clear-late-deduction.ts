import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * An approved time correction supersedes the original tardiness result.
 * Clear it at the attendance source and update every still-editable payroll
 * run containing that day. Finalized payroll remains immutable.
 */
export async function clearLateDeductionForApprovedCorrection(input: {
  companyId: string
  employeeId: string
  correctionDate: Date
  dtrRecordId: string
}) {
  const payslips = await prisma.payslip.findMany({
    where: {
      employeeId: input.employeeId,
      payrollRun: {
        companyId: input.companyId,
        periodStart: { lte: input.correctionDate },
        periodEnd: { gte: input.correctionDate },
        status: { in: ['DRAFT', 'COMPUTED', 'FOR_APPROVAL'] },
      },
    },
    select: {
      id: true,
      payrollRunId: true,
      lateDeduction: true,
      totalDeductions: true,
      grossPay: true,
      manualEdits: true,
    },
  })

  const affectedRunIds = Array.from(new Set(payslips.map(item => item.payrollRunId)))

  await prisma.$transaction(async tx => {
    await tx.dTRRecord.update({
      where: { id: input.dtrRecordId },
      data: { lateMinutes: 0 },
    })

    for (const payslip of payslips) {
      const lateDeduction = payslip.lateDeduction.toNumber()
      if (lateDeduction <= 0) continue

      const totalDeductions = Math.max(0, payslip.totalDeductions.toNumber() - lateDeduction)
      const manualEdits = payslip.manualEdits && typeof payslip.manualEdits === 'object' && !Array.isArray(payslip.manualEdits)
        ? { ...(payslip.manualEdits as Record<string, unknown>), lateDeduction: 0 }
        : { lateDeduction: 0 }

      await tx.payslip.update({
        where: { id: payslip.id },
        data: {
          lateDeduction: 0,
          totalDeductions,
          netPay: payslip.grossPay.toNumber() - totalDeductions,
          manualEdits: manualEdits as Prisma.InputJsonValue,
        },
      })
    }

    for (const payrollRunId of affectedRunIds) {
      const totals = await tx.payslip.aggregate({
        where: { payrollRunId },
        _sum: { basicSalary: true, grossPay: true, totalDeductions: true, netPay: true },
      })
      await tx.payrollRun.update({
        where: { id: payrollRunId },
        data: {
          totalBasic: totals._sum.basicSalary ?? 0,
          totalGross: totals._sum.grossPay ?? 0,
          totalDeductions: totals._sum.totalDeductions ?? 0,
          totalNetPay: totals._sum.netPay ?? 0,
        },
      })
    }
  })
}
