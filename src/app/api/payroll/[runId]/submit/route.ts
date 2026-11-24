import { restDayPayrollIssue } from '@/lib/payroll/rest-day-review'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { auditPayrollRun } from '@/lib/payroll/anomalies'

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'])
  if (error) return error

  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId: ctx.companyId } })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const restDayIssue = await restDayPayrollIssue(runId, ctx.companyId, run.periodStart, run.periodEnd)
  if (restDayIssue) return NextResponse.json({ error: restDayIssue }, { status: 409 })
  if (run.computationStartedAt) return NextResponse.json({ error: 'Wait for payroll computation to finish' }, { status: 409 })
  if (run.status !== 'COMPUTED') {
    return NextResponse.json({ error: 'Payroll must be COMPUTED to submit for approval' }, { status: 400 })
  }
  const critical = (await auditPayrollRun(runId, ctx.companyId)).filter(item => item.severity === 'critical')
  if (critical.length) return NextResponse.json({ error: `Resolve ${critical.length} critical payroll check${critical.length === 1 ? '' : 's'} before submission.`, code: 'PAYROLL_ANOMALIES', anomalies: critical }, { status: 422 })

  const updated = await prisma.payrollRun.updateMany({
    where: { id: runId, companyId: ctx.companyId, status: 'COMPUTED', computationStartedAt: null },
    data: { status: 'FOR_APPROVAL', approvalLevel: 0, approvalTrail: [] },
  })
  if(!updated.count)return NextResponse.json({error:'Payroll changed. Refresh before submitting.'},{status:409})
  logAudit(ctx, 'SUBMIT', 'PayrollRun', runId, {
    description: `Submitted payroll run for approval (${run.periodStart.toISOString().slice(0, 10)} to ${run.periodEnd.toISOString().slice(0, 10)})`,
  }).catch(() => {})
  return NextResponse.json({...run,status:'FOR_APPROVAL',approvalLevel:0,approvalTrail:[]})
}
