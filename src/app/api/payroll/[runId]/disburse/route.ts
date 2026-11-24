import { encashmentPayrollIssue } from '@/lib/payroll/encashment-run'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!await ctxHasPermission(ctx, 'payroll:lock')) return NextResponse.json({ error: 'You do not have permission to mark payroll as disbursed.' }, { status: 403 })
  const { runId } = await params
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
    const run = await tx.payrollRun.findFirst({ where: { id: runId, companyId: ctx.companyId } })
    if (!run) return { error: 'Payroll run not found', code: 404 }
    if (run.status === 'DISBURSED') return { ok: true, changed: false }
    if (run.status !== 'LOCKED' || run.computationStartedAt) return { error: 'Lock the completed payroll before marking it as disbursed.', code: 409 }
    if(run.runType==='LEAVE_ENCASHMENT') { const issue=await encashmentPayrollIssue(tx,runId,ctx.companyId);if(issue)return {error:issue,code:409} }
    if(run.runType==='THIRTEENTH_MONTH') {
      const logs=await tx.thirteenthMonthLog.findMany({where:{companyId:ctx.companyId,payrollRunId:runId}})
      const slips=await tx.payslip.findMany({where:{payrollRunId:runId},select:{employeeId:true,grossPay:true,netPay:true,totalDeductions:true,withholdingTax:true}})
      if(!logs.length||logs.length!==slips.length||slips.some(s=>{const log=logs.find(l=>l.employeeId===s.employeeId);return !log||Math.abs(Number(log.thirteenthAmount)-Number(s.grossPay))>.01||Number(s.netPay)<0||Math.abs(Number(s.grossPay)-Number(s.totalDeductions)-Number(s.netPay))>.01||Number(s.totalDeductions)!==Number(s.withholdingTax)}))return {error:'Review the linked 13th-month amounts before confirming payment.',code:409}
    }
    const updated = await tx.payrollRun.updateMany({
      where: { id: runId, companyId: ctx.companyId, status: 'LOCKED', computationStartedAt: null },
      data: { status: 'DISBURSED', disbursedAt: new Date(), disbursedBy: ctx.userId },
    })
    if (!updated.count) return { error: 'Payroll status changed. Refresh and try again.', code: 409 }
    if(run.runType==='THIRTEENTH_MONTH')await tx.thirteenthMonthLog.updateMany({where:{companyId:ctx.companyId,payrollRunId:runId,isPaid:false},data:{isPaid:true,paidAt:new Date()}})
    return { ok: true, changed: true }
  })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.code })
  if (result.changed) await logAudit(ctx, 'UPDATE', 'PayrollRun', runId, {
    description: 'Marked payroll as disbursed: payment confirmed manually',
    oldValues: { status: 'LOCKED' }, newValues: { status: 'DISBURSED', disbursedBy: ctx.userId },
  }).catch(() => {})
  return NextResponse.json({ ok: true, status: 'DISBURSED' })
}
