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
  if (run.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Payroll must be APPROVED before locking' }, { status: 400 })
  }

  // Locking is a STATUS CHANGE ONLY.
  //
  // It used to also walk the payslips and draw down loan balances, writing a
  // PayslipLoanDeduction row per loan. But the compute route already does
  // exactly that (its Step 3), and it does it recompute-safely — crediting
  // prior debits back before re-applying. Lock knew nothing about that, so
  // every locked run debited each loan a SECOND time and left a duplicate
  // ledger row, while the employee was only ever withheld once (the payslip's
  // own sssLoanDeduction / pagibigLoan / companyLoan figures).
  //
  // That silently under-collected: balances fell by twice what was withheld
  // and loans flipped to FULLY_PAID early. Compute is now the single owner of
  // the loan ledger and of loan balances; nothing here touches them.
  await prisma.payrollRun.update({
    where: { id: runId },
    data: { status: 'LOCKED' },
  })

  logAudit(ctx, 'LOCK', 'PayrollRun', runId, {
    description: 'Locked payroll run',
  }).catch(() => {})
  return NextResponse.json({ ok: true, status: 'LOCKED' })
}
