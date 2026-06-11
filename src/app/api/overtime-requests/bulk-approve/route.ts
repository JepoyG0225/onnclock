import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { isOvertimeEnabledForCompany } from '@/lib/overtime-requests'
import { authorizeAdvance, buildPlan, resolveWorkflow } from '@/lib/approvals/engine'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

const bodySchema = z.object({
  /** Optional list of specific request IDs. If omitted, approves ALL pending the user can act on. */
  ids: z.array(z.string()).optional(),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  // Block if overtime pay is disabled
  if (!(await isOvertimeEnabledForCompany(ctx.companyId))) {
    return NextResponse.json(
      { error: 'Overtime pay is disabled in payroll settings. Enable it before approving overtime requests.' },
      { status: 422 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error' }, { status: 422 })
  }

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
    return NextResponse.json({ approved: 0 })
  }

  // Check legacy permission once
  const legacyCanApprove = await ctxHasPermission(ctx, 'overtime:approve')

  // Resolve workflows by department (cached per department)
  const workflowCache = new Map<string, Awaited<ReturnType<typeof resolveWorkflow>>>()

  let approved = 0
  const approvedIds: string[] = []

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

    // Determine if user can approve this request
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

    // Approve the request
    await prisma.overtimeRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        approvedById: ctx.userId,
        approvedAt: new Date(),
      },
    })

    approved++
    approvedIds.push(request.id)
  }

  // Single audit log for bulk action
  if (approved > 0) {
    logAudit(ctx, 'BULK_APPROVE', 'OvertimeRequest', approvedIds[0], {
      description: `Bulk approved ${approved} overtime request${approved === 1 ? '' : 's'}`,
      newValues: { approvedCount: approved, ids: approvedIds },
    }).catch(() => {})
  }

  return NextResponse.json({ approved, total: pendingRequests.length })
}
