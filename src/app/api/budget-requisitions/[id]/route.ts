import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { Prisma } from '@prisma/client'
import { evaluateApprovalAction, type RequestFacts } from '@/lib/approvals/engine'
import { notifyAfterApprove } from '@/lib/approvals/notify'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { z } from 'zod'

const trailOf = (v: unknown) => (Array.isArray(v) ? v : [])

const HR_ROLES = new Set(['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN'])

async function checkBudgetReqAccess(ctx: { role?: string | null; companyId?: string | null }): Promise<NextResponse | null> {
  if (HR_ROLES.has(ctx.role ?? '')) return null
  const sub = await getCompanySubscription(ctx.companyId ?? '')
  if (hasHrisProFeature(sub.pricePerSeat) || sub.isTrial) return null
  return NextResponse.json(
    { error: 'Budget Requisitions require a Pro or Trial subscription.', notEntitled: true },
    { status: 403 }
  )
}

const patchSchema = z.object({
  status:     z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
  reviewNote: z.string().optional().nullable(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const gate = await checkBudgetReqAccess(ctx)
  if (gate) return gate

  const { id } = await params

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })

  const isHR = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN'].includes(ctx.role ?? '')

  const requisition = await prisma.budgetRequisition.findFirst({
    where: {
      id,
      ...(isHR
        ? { company: { id: ctx.companyId! } }
        : { employeeId: employee?.id ?? '__none__' }
      ),
    },
    include: {
      items: true,
      attachments: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!requisition) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ requisition })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const gate = await checkBudgetReqAccess(ctx)
  if (gate) return gate

  const isHR = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN'].includes(ctx.role ?? '')

  // Only HR/admin can approve or reject; employees can only cancel their own
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { status, reviewNote } = parsed.data
  const { id } = await params

  // Fetch the requisition
  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })

  // Load by company (not owner-only). A workflow approver — who may be any role,
  // e.g. a PAYROLL_OFFICER set as the requisition's approver — must be able to
  // find a requisition filed by someone else. Authorization for each action is
  // enforced below (engine decision for approve/reject; ownership for cancel).
  // Previously this used an owner-only filter for non-HR roles, so the
  // designated approver got a 404 and the requisition stayed PENDING.
  const existing = await prisma.budgetRequisition.findFirst({
    where: { id, company: { id: ctx.companyId! } },
    include: { employee: { select: { departmentId: true, firstName: true, lastName: true } } },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isOwner = !!employee && existing.employeeId === employee.id
  const include = { items: true, attachments: { orderBy: { createdAt: 'asc' as const } } }

  // ── Cancellation: ownership rules (no approval chain) ──
  if (status === 'CANCELLED') {
    if (!isHR && !isOwner) {
      return NextResponse.json({ error: 'You can only cancel your own requisitions' }, { status: 403 })
    }
    if (!isHR && existing.status !== 'PENDING') {
      return NextResponse.json({ error: 'Only pending requests can be cancelled' }, { status: 400 })
    }
    const updated = await prisma.budgetRequisition.update({ where: { id }, data: { status }, include })
    logAudit(ctx, 'CANCEL', 'BudgetRequisition', id).catch(() => {})
    return NextResponse.json({ requisition: updated })
  }

  // ── Approve / Reject: workflow engine, legacy HR gate as fallback ──
  const action = status === 'APPROVED' ? 'approve' : 'reject'
  const requesterDepartmentId = existing.employee?.departmentId ?? null
  const requesterName = `${existing.employee?.firstName ?? ''} ${existing.employee?.lastName ?? ''}`.trim() || 'An employee'

  const decision = await evaluateApprovalAction({
    companyId: ctx.companyId!,
    type: 'BUDGET',
    requesterDepartmentId,
    requesterEmployeeId: existing.employeeId,
    facts: { amount: Number(existing.totalAmount), title: existing.title, departmentId: requesterDepartmentId ?? '' } as RequestFacts,
    currentLevel: existing.approvalLevel ?? 0,
    actorUserId: ctx.userId,
    action,
    notes: reviewNote ?? null,
  })

  if (decision.usedWorkflow) {
    if (!decision.authorized) {
      return NextResponse.json({ error: 'Not authorized for this approval level' }, { status: 403 })
    }
  } else if (!(await ctxHasPermission(ctx, 'budget:approve'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const newTrail = [...trailOf(existing.approvalTrail), decision.trailEntry] as Prisma.InputJsonValue

  // Intermediate approval: advance the chain, stay PENDING.
  if (action === 'approve' && decision.usedWorkflow && !decision.isFinal) {
    const updated = await prisma.budgetRequisition.update({
      where: { id },
      data: { approvalLevel: decision.nextLevel, approvalTrail: newTrail },
      include,
    })
    if (decision.plan) {
      await notifyAfterApprove({
        plan: decision.plan,
        nextLevel: decision.nextLevel,
        isFinal: false,
        ctx: { companyId: ctx.companyId!, requesterEmployeeId: existing.employeeId, requesterDepartmentId, link: '/budget-requisitions', vars: { requestType: 'Budget Requisition', requesterName } },
        nextApproverTitle: 'Budget requisition awaiting your approval',
        nextApproverBody: `${requesterName} · ₱${Number(existing.totalAmount).toLocaleString()}`,
      })
    }
    return NextResponse.json({ requisition: updated })
  }

  // Final approval or rejection — record the review.
  const updated = await prisma.budgetRequisition.update({
    where: { id },
    data: {
      status,
      reviewedBy: ctx.userId,
      reviewNote: reviewNote ?? null,
      reviewedAt: new Date(),
      approvalLevel: decision.nextLevel,
      approvalTrail: newTrail,
    },
    include,
  })

  if (action === 'approve' && decision.plan) {
    await notifyAfterApprove({
      plan: decision.plan,
      nextLevel: decision.nextLevel,
      isFinal: true,
      ctx: { companyId: ctx.companyId!, requesterEmployeeId: existing.employeeId, requesterDepartmentId, link: '/budget-requisitions', vars: { requestType: 'Budget Requisition', requesterName } },
      nextApproverTitle: '', nextApproverBody: '',
    })
  }

  logAudit(ctx, action === 'approve' ? 'APPROVE' : 'REJECT', 'BudgetRequisition', id, {
    newValues: { status: updated.status },
  }).catch(() => {})

  return NextResponse.json({ requisition: updated })
}
