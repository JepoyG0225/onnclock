import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { authorizeAdvance, buildPlan, resolveWorkflow } from '@/lib/approvals/engine'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

const bodySchema = z.object({
  /** Optional list of specific request IDs. If omitted, rejects ALL pending the user can act on. */
  ids: z.array(z.string()).optional(),
  /** Optional shared rejection reason applied to every rejected request. */
  reason: z.string().max(1000).optional(),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error' }, { status: 422 })
  }
  const reason = parsed.data.reason?.trim() || null

  const where: Prisma.OvertimeRequestWhereInput = {
    companyId: ctx.companyId,
    status: 'PENDING',
    ...(parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : {}),
  }

  const pendingRequests = await prisma.overtimeRequest.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          departmentId: true,
        },
      },
    },
    take: 500, // Safety cap
  })

  if (pendingRequests.length === 0) {
    return NextResponse.json({ rejected: 0 })
  }

  // Check legacy permission once (reject shares the overtime:approve grant).
  const legacyCanApprove = await ctxHasPermission(ctx, 'overtime:approve')

  // Resolve workflows by department (cached per department)
  const workflowCache = new Map<string, Awaited<ReturnType<typeof resolveWorkflow>>>()

  let rejected = 0
  const rejectedIds: string[] = []

  for (const request of pendingRequests) {
    const departmentId = request.employee?.departmentId ?? null
    const workflowKey = departmentId ?? '__none__'

    if (!workflowCache.has(workflowKey)) {
      workflowCache.set(
        workflowKey,
        await resolveWorkflow({
          companyId: ctx.companyId,
          type: 'OVERTIME',
          departmentId,
        }),
      )
    }
    const workflow = workflowCache.get(workflowKey) ?? null

    // Determine if user can act on this request (same authorization as approve).
    let canAct = false
    if (!workflow) {
      canAct = legacyCanApprove
    } else {
      const currentLevel = request.approvalLevel ?? 0
      const plan = buildPlan(workflow, {
        hours: request.hours,
        departmentId: departmentId ?? '',
      })
      const advance = await authorizeAdvance({
        plan,
        currentLevel,
        actorUserId: ctx.userId,
        requesterDepartmentId: departmentId,
        requesterEmployeeId: request.employeeId,
      })
      canAct = advance.noChain || advance.authorized
    }

    if (!canAct) continue

    // A rejection is terminal at any authorized level. Record it in the
    // approval trail so the activity feed shows who rejected and why.
    const priorTrail = Array.isArray(request.approvalTrail) ? request.approvalTrail : []
    const trailEntry = {
      level: request.approvalLevel ?? 0,
      userId: ctx.userId,
      action: 'reject',
      notes: reason,
      at: new Date().toISOString(),
    }

    await prisma.overtimeRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        ...(reason ? { rejectionReason: reason } : {}),
        approvalTrail: [...priorTrail, trailEntry] as Prisma.InputJsonValue,
      },
    })

    rejected++
    rejectedIds.push(request.id)
  }

  // Single audit log for bulk action
  if (rejected > 0) {
    logAudit(ctx, 'BULK_REJECT', 'OvertimeRequest', rejectedIds[0], {
      description: `Bulk rejected ${rejected} overtime request${rejected === 1 ? '' : 's'}`,
      newValues: { rejectedCount: rejected, ids: rejectedIds, reason },
    }).catch(() => {})
  }

  return NextResponse.json({ rejected, total: pendingRequests.length })
}
