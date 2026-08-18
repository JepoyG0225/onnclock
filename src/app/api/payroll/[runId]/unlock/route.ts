import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  // Unlocking reverses a lock — gate on the same payroll:lock permission.
  if (!(await ctxHasPermission(ctx, 'payroll:lock'))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
  })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  if (run.status !== 'LOCKED') {
    return NextResponse.json({ error: 'Only LOCKED payroll runs can be unlocked' }, { status: 400 })
  }

  // Status change only — the mirror of lock.
  //
  // This used to credit every PayslipLoanDeduction back to its loan and delete
  // the ledger rows. Those rows belong to the compute route now, so wiping
  // them here would erase the record of repayments that were actually withheld
  // and leave the run with no ledger at all unless someone remembered to
  // recompute. Recompute already reverses and re-applies correctly on its own.
  await prisma.payrollRun.update({
    where: { id: runId },
    data: { status: 'APPROVED' },
  })

  await logAudit(ctx, 'UNLOCK', 'PayrollRun', runId, {
    description: 'Unlocked payroll run',
    oldValues: { status: 'LOCKED' },
    newValues: { status: 'APPROVED' },
  }).catch(() => {})

  return NextResponse.json({ ok: true, status: 'APPROVED' })
}
