import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { isOvertimeEnabledForCompany } from '@/lib/overtime-requests'
import { Prisma } from '@prisma/client'
import { evaluateApprovalAction, type RequestFacts } from '@/lib/approvals/engine'
import { notifyAfterApprove } from '@/lib/approvals/notify'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { z } from 'zod'

const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

const trailOf = (v: unknown) => (Array.isArray(v) ? v : [])

const patchSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
  rejectionReason: z.string().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const request = await prisma.overtimeRequest.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
    },
  })

  if (!request) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ request })
}

const includeEmployee = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNo: true,
      departmentId: true,
      department: { select: { name: true } },
      position: { select: { title: true } },
    },
  },
} as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authority is chain-driven when a workflow exists; otherwise the legacy
  // HR-role gate applies. So authenticate without a fixed role here.
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const existing = await prisma.overtimeRequest.findFirst({
    where: { id, companyId: ctx.companyId },
    include: includeEmployee,
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { status, rejectionReason } = parsed.data

  // Cancellation stays a simple legacy HR action — no workflow chain.
  if (status === 'CANCELLED') {
    if (!HR_ROLES.includes(ctx.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    const updated = await prisma.overtimeRequest.update({
      where: { id }, data: { status }, include: includeEmployee,
    })
    logAudit(ctx, 'CANCEL', 'OvertimeRequest', id, {
      description: `Cancelled overtime request for ${existing.employee?.firstName ?? ''} ${existing.employee?.lastName ?? ''}`.trim(),
    }).catch(() => {})
    return NextResponse.json({ request: updated })
  }

  if (existing.status !== 'PENDING') {
    return NextResponse.json({ error: `Request is already ${existing.status.toLowerCase()}` }, { status: 400 })
  }

  const action = status === 'APPROVED' ? 'approve' : 'reject'
  const requesterDepartmentId = existing.employee?.departmentId ?? null
  const facts: RequestFacts = { hours: existing.hours, departmentId: requesterDepartmentId ?? '' }

  const decision = await evaluateApprovalAction({
    companyId: ctx.companyId,
    type: 'OVERTIME',
    requesterDepartmentId,
    requesterEmployeeId: existing.employeeId,
    facts,
    currentLevel: existing.approvalLevel ?? 0,
    actorUserId: ctx.userId,
    action,
    notes: rejectionReason ?? null,
  })

  // Authorization: chain when configured, legacy HR roles otherwise.
  if (decision.usedWorkflow) {
    if (!decision.authorized) {
      return NextResponse.json({ error: 'Not authorized for this approval level' }, { status: 403 })
    }
  } else if (!(await ctxHasPermission(ctx, 'overtime:approve'))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const newTrail = [...trailOf(existing.approvalTrail), decision.trailEntry] as Prisma.InputJsonValue
  const requesterName = `${existing.employee?.firstName ?? ''} ${existing.employee?.lastName ?? ''}`.trim() || 'An employee'

  // Intermediate approval: advance the chain, stay PENDING, no side effects.
  if (action === 'approve' && decision.usedWorkflow && !decision.isFinal) {
    const updated = await prisma.overtimeRequest.update({
      where: { id },
      data: { approvalLevel: decision.nextLevel, approvalTrail: newTrail },
      include: includeEmployee,
    })
    if (decision.plan) {
      await notifyAfterApprove({
        plan: decision.plan,
        nextLevel: decision.nextLevel,
        isFinal: false,
        ctx: { companyId: ctx.companyId, requesterEmployeeId: existing.employeeId, requesterDepartmentId, link: '/overtime-requests', vars: { requestType: 'Overtime', requesterName } },
        nextApproverTitle: 'Overtime request awaiting your approval',
        nextApproverBody: `${requesterName} · ${existing.hours}h`,
      })
    }
    return NextResponse.json({ request: updated })
  }

  // Final approval — block when overtime pay is disabled in payroll settings.
  if (action === 'approve' && !(await isOvertimeEnabledForCompany(ctx.companyId))) {
    return NextResponse.json(
      { error: 'Overtime pay is disabled in payroll settings. Enable it before approving overtime requests.' },
      { status: 422 }
    )
  }

  const updateData: Prisma.OvertimeRequestUpdateInput = {
    status,
    approvalLevel: decision.nextLevel,
    approvalTrail: newTrail,
  }
  if (action === 'approve') {
    updateData.approvedById = ctx.userId
    updateData.approvedAt = new Date()
  }
  if (action === 'reject' && rejectionReason) {
    updateData.rejectionReason = rejectionReason
  }

  const updated = await prisma.overtimeRequest.update({
    where: { id },
    data: updateData,
    include: includeEmployee,
  })

  if (action === 'approve' && decision.plan) {
    await notifyAfterApprove({
      plan: decision.plan,
      nextLevel: decision.nextLevel,
      isFinal: true,
      ctx: { companyId: ctx.companyId, requesterEmployeeId: existing.employeeId, requesterDepartmentId, link: '/overtime-requests', vars: { requestType: 'Overtime', requesterName } },
      nextApproverTitle: '', nextApproverBody: '',
    })
  }

  logAudit(ctx, action === 'approve' ? 'APPROVE' : 'REJECT', 'OvertimeRequest', id, {
    description: `${action === 'approve' ? 'Approved' : 'Rejected'} overtime request for ${requesterName} (${existing.hours}h)`,
    newValues: { status: updated.status },
  }).catch(() => {})

  return NextResponse.json({ request: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const { id } = await params

  const existing = await prisma.overtimeRequest.findFirst({
    where: { id, companyId: ctx.companyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.overtimeRequest.delete({ where: { id } })

  logAudit(ctx, 'DELETE', 'OvertimeRequest', id, {
    description: `Deleted overtime request`,
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}
