import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { approveAutoOtForRange, isOvertimeEnabledForCompany } from '@/lib/overtime-requests'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN']

/**
 * Approve every PENDING auto-generated ([AUTO_OT]) overtime request that falls
 * within this run's pay period, company-wide. Auto-OT is created from DTR
 * overtime but stays PENDING until approved; payroll only pays APPROVED OT.
 * After calling this, the run must be recomputed for the OT to appear in pay.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
    select: { id: true, periodStart: true, periodEnd: true, status: true },
  })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  if (run.status === 'LOCKED') {
    return NextResponse.json({ error: 'Run is locked' }, { status: 400 })
  }

  if (!(await isOvertimeEnabledForCompany(ctx.companyId))) {
    return NextResponse.json({
      approved: 0,
      overtimeDisabled: true,
      error: 'Overtime pay is disabled in payroll settings. Enable it before approving overtime.',
    }, { status: 422 })
  }

  const approved = await approveAutoOtForRange({
    companyId: ctx.companyId,
    dateFrom: run.periodStart,
    dateTo: run.periodEnd,
    approvedById: ctx.userId,
  })

  return NextResponse.json({ approved })
}
