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

  // Delete payslip loan deductions first (FK constraint), then payslips, then the run
  await prisma.$transaction([
    prisma.payslipLoanDeduction.deleteMany({
      where: { payslip: { payrollRunId: runId } },
    }),
    prisma.payslip.deleteMany({ where: { payrollRunId: runId } }),
    prisma.payrollRun.delete({ where: { id: runId } }),
  ])

  return NextResponse.json({ success: true })
}
