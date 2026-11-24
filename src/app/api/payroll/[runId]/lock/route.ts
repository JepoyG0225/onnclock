import { restDayPayrollIssue } from '@/lib/payroll/rest-day-review'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  // Gate by the payroll:lock permission so the Role Permissions matrix applies
  // (admins always pass). Previously this hardcoded COMPANY_ADMIN/SUPER_ADMIN,
  // which ignored any lock permission granted to other roles.
  if (!(await ctxHasPermission(ctx, 'payroll:lock'))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
  })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  const restDayIssue = await restDayPayrollIssue(runId, ctx.companyId, run.periodStart, run.periodEnd)
  if (restDayIssue) return NextResponse.json({ error: restDayIssue }, { status: 409 })
  if (run.computationStartedAt) return NextResponse.json({ error: 'Wait for payroll computation to finish' }, { status: 409 })
  if (run.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Payroll must be APPROVED before locking' }, { status: 400 })
  }

  // Payroll compute already creates the per-loan ledger entries and applies
  // their exact amounts to loan balances. Locking is therefore only a state
  // transition. Re-applying the aggregate payslip columns here used to debit
  // loans twice and could even allocate the second debit to a different loan.
  const updated = await prisma.payrollRun.updateMany({
    where: { id: runId, companyId: ctx.companyId, status: 'APPROVED', computationStartedAt: null },
    data: { status: 'LOCKED' },
  })

  if (!updated.count) return NextResponse.json({ error: 'Payroll status changed. Refresh and try again.' }, { status: 409 })

  logAudit(ctx, 'LOCK', 'PayrollRun', runId, {
    description: `Locked payroll run — computed loan deductions retained`,
  }).catch(() => {})
  return NextResponse.json({ ok: true, status: 'LOCKED' })
}
