import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { Prisma } from '@prisma/client'
import { resolveWorkflow, buildPlan, authorizeAdvance, type RequestFacts } from '@/lib/approvals/engine'

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  // PAYROLL_OFFICER and DEPARTMENT_HEAD are included because either may be the
  // designated approver for a payroll workflow step. The per-level configured-
  // approver check below still gates who can approve which level — this outer
  // wall only keeps fully-unrelated roles (e.g. EMPLOYEE) out.
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'DEPARTMENT_HEAD'])
  if (error) return error

  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId: ctx.companyId } })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (run.status !== 'FOR_APPROVAL') {
    return NextResponse.json({ error: 'Payroll must be submitted for approval first' }, { status: 400 })
  }

  const currentLevel = run.approvalLevel ?? 0
  let nextLevel: number
  let isFinal: boolean

  // Prefer the configurable Workflow Builder workflow (company-default for
  // PAYROLL); fall back to the legacy ApproverConfig chain for companies that
  // haven't been switched over yet, so nothing breaks during rollout.
  const workflow = await resolveWorkflow({ companyId: ctx.companyId, type: 'PAYROLL', departmentId: null })
  const facts: RequestFacts = { totalGross: Number(run.totalGross) }
  const plan = workflow ? buildPlan(workflow, facts) : null

  if (plan) {
    const adv = await authorizeAdvance({ plan, currentLevel, actorUserId: ctx.userId, requesterDepartmentId: null })
    if (!adv.noChain && !adv.authorized) {
      return NextResponse.json({ error: 'Not authorized for this approval level' }, { status: 403 })
    }
    nextLevel = adv.nextLevel
    isFinal = adv.isFinal
  } else {
    const approvers = await prisma.approverConfig.findMany({
      where: { companyId: ctx.companyId, type: 'PAYROLL' },
      orderBy: { level: 'asc' },
    })
    const maxLevel = approvers.length
    nextLevel = currentLevel + 1
    const expectedApprover = approvers.find(a => a.level === nextLevel)
    if (maxLevel > 0) {
      if (!expectedApprover || expectedApprover.userId !== ctx.userId) {
        return NextResponse.json({ error: 'Not authorized for this approval level' }, { status: 403 })
      }
    }
    isFinal = maxLevel === 0 || nextLevel >= maxLevel
  }

  const prevTrail = Array.isArray(run.approvalTrail) ? run.approvalTrail : []
  const trailEntry = {
    level: nextLevel,
    userId: ctx.userId,
    action: 'approve',
    at: new Date().toISOString(),
  }

  try {
    const updated = await prisma.payrollRun.update({
      where: { id: runId },
      data: {
        approvalLevel: nextLevel,
        approvalTrail: [...prevTrail, trailEntry] as Prisma.InputJsonValue,
        status: isFinal ? 'APPROVED' : 'FOR_APPROVAL',
        approvedBy: isFinal ? ctx.userId : run.approvedBy,
        approvedAt: isFinal ? new Date() : run.approvedAt,
      },
    })
    logAudit(ctx, 'APPROVE', 'PayrollRun', runId, {
      newValues: { status: updated.status },
    }).catch(() => {})
    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
      return NextResponse.json(
        { error: 'Database schema is out of date. Run prisma migrate to add approval columns.' },
        { status: 500 },
      )
    }
    throw e
  }
}
