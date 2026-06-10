import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { Prisma } from '@prisma/client'
import { evaluateApprovalAction, type RequestFacts } from '@/lib/approvals/engine'
import { notifyAfterApprove } from '@/lib/approvals/notify'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { z } from 'zod'

const ADMIN_ROLES = ['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'DEPARTMENT_HEAD']
const trailOf = (v: unknown) => (Array.isArray(v) ? v : [])

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  adminNotes: z.string().optional(),
})

// PATCH — admin approves or rejects
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // Authority is chain-driven when a workflow exists; otherwise legacy roles.
  const { ctx, error } = await requireAuth()
  if (error) return error

  const companyId = resolveCompanyIdForRequest(ctx, req) ?? ctx.companyId

  const correction = await prisma.timeEntryCorrection.findFirst({
    where: { id, companyId },
    include: { employee: { select: { id: true, companyId: true, departmentId: true, firstName: true, lastName: true } } },
  })
  if (!correction) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (correction.status !== 'PENDING') {
    return NextResponse.json({ error: 'This request has already been reviewed.' }, { status: 409 })
  }

  const body = await req.json()
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { action, adminNotes } = parsed.data
  const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED'

  const requesterDepartmentId = correction.employee?.departmentId ?? null
  const requesterName = `${correction.employee?.firstName ?? ''} ${correction.employee?.lastName ?? ''}`.trim() || 'An employee'

  const decision = await evaluateApprovalAction({
    companyId,
    type: 'TIME_CORRECTION',
    requesterDepartmentId,
    requesterEmployeeId: correction.employeeId,
    facts: { departmentId: requesterDepartmentId ?? '' } as RequestFacts,
    currentLevel: correction.approvalLevel ?? 0,
    actorUserId: ctx.userId,
    action,
    notes: adminNotes ?? null,
  })

  if (decision.usedWorkflow) {
    if (!decision.authorized) {
      return NextResponse.json({ error: 'Not authorized for this approval level' }, { status: 403 })
    }
  } else if (!(ADMIN_ROLES.includes(ctx.role) || await ctxHasPermission(ctx, 'corrections:approve'))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const newTrail = [...trailOf(correction.approvalTrail), decision.trailEntry] as Prisma.InputJsonValue

  // Intermediate approval: advance the chain, stay PENDING, do NOT apply the
  // DTR change yet — that only happens on the final approval.
  if (action === 'approve' && decision.usedWorkflow && !decision.isFinal) {
    const advanced = await prisma.timeEntryCorrection.update({
      where: { id },
      data: { approvalLevel: decision.nextLevel, approvalTrail: newTrail },
    })
    if (decision.plan) {
      await notifyAfterApprove({
        plan: decision.plan,
        nextLevel: decision.nextLevel,
        isFinal: false,
        ctx: { companyId, requesterEmployeeId: correction.employeeId, requesterDepartmentId, link: '/time-corrections', vars: { requestType: 'Time Correction', requesterName } },
        nextApproverTitle: 'Time correction awaiting your approval',
        nextApproverBody: requesterName,
      })
    }
    return NextResponse.json({ correction: advanced })
  }

  // If approving (final), apply the correction to the DTR record (or create one
  // when this is a "manual entry" request with no existing DTR row).
  if (action === 'approve') {
    const targetDtr = correction.dtrRecordId
      ? await prisma.dTRRecord.findFirst({
          where: { id: correction.dtrRecordId, employeeId: correction.employee.id },
        })
      : await prisma.dTRRecord.findFirst({
          where: { employeeId: correction.employee.id, date: correction.date },
          orderBy: { createdAt: 'desc' },
        })

    // Manila-date string so "HH:MM" times are stored at +08:00.
    const corrDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(correction.date)
    function toDateTime(timeStr: string | null): Date | null {
      if (!timeStr) return null
      return new Date(`${corrDate}T${timeStr}:00+08:00`)
    }
    const reqTimeIn   = toDateTime(correction.timeIn)
    const reqTimeOut  = toDateTime(correction.timeOut)
    const reqBreakIn  = toDateTime(correction.breakIn)
    const reqBreakOut = toDateTime(correction.breakOut)

    if (targetDtr) {
      // Update existing DTR — only overwrite the fields the request includes.
      const newTimeIn  = reqTimeIn  ?? targetDtr.timeIn
      const newTimeOut = reqTimeOut ?? targetDtr.timeOut
      const newBreakIn  = reqBreakIn  ?? targetDtr.breakIn
      const newBreakOut = reqBreakOut ?? targetDtr.breakOut

      await prisma.dTRRecord.update({
        where: { id: targetDtr.id },
        data: {
          ...(newTimeIn  ? { timeIn:  newTimeIn  } : {}),
          ...(newTimeOut !== undefined ? { timeOut: newTimeOut } : {}),
          ...(newBreakIn  !== undefined ? { breakIn:  newBreakIn  } : {}),
          ...(newBreakOut !== undefined ? { breakOut: newBreakOut } : {}),
        },
      })
    } else {
      // Manual entry — no DTR exists yet. Create a fresh row so the
      // employee's day actually shows the worked time.
      await prisma.dTRRecord.create({
        data: {
          employeeId: correction.employee.id,
          date: correction.date,
          timeIn:  reqTimeIn  ?? undefined,
          timeOut: reqTimeOut ?? undefined,
          breakIn:  reqBreakIn  ?? undefined,
          breakOut: reqBreakOut ?? undefined,
          source: 'MANUAL_CORRECTION',
          remarks: `Created from manual time correction request (${correction.id}). Employee reason: ${correction.reason}`,
        },
      })
    }
  }

  const updated = await prisma.timeEntryCorrection.update({
    where: { id },
    data: {
      status: newStatus,
      adminNotes: adminNotes ?? null,
      reviewedBy: ctx.userId,
      reviewedAt: new Date(),
      approvalLevel: decision.nextLevel,
      approvalTrail: newTrail,
    },
  })

  if (action === 'approve' && decision.plan) {
    await notifyAfterApprove({
      plan: decision.plan,
      nextLevel: decision.nextLevel,
      isFinal: true,
      ctx: { companyId, requesterEmployeeId: correction.employeeId, requesterDepartmentId, link: '/time-corrections', vars: { requestType: 'Time Correction', requesterName } },
      nextApproverTitle: '', nextApproverBody: '',
    })
  }

  logAudit(ctx, action === 'approve' ? 'APPROVE' : 'REJECT', 'TimeCorrection', id, {
    description: `${action === 'approve' ? 'Approved' : 'Rejected'} time correction for ${requesterName}`,
    newValues: { status: updated.status },
  }).catch(() => {})

  return NextResponse.json({ correction: updated })
}

// DELETE — employee cancels their own pending request
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  const correction = await prisma.timeEntryCorrection.findFirst({
    where: { id, companyId: ctx.companyId },
  })
  if (!correction) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Employees can only cancel their own pending requests
  const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'DEPARTMENT_HEAD'].includes(ctx.role)
  if (!isAdmin) {
    // Resolve employee and verify ownership
    const { resolvePortalEmployeeId } = await import('@/lib/portal-employee')
    const employeeId = await resolvePortalEmployeeId(ctx)
    if (correction.employeeId !== employeeId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    if (correction.status !== 'PENDING') {
      return NextResponse.json({ error: 'Only pending requests can be cancelled.' }, { status: 409 })
    }
  }

  await prisma.timeEntryCorrection.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
