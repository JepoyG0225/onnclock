import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { authorizeAdvance, buildPlan, resolveWorkflow } from '@/lib/approvals/engine'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { z } from 'zod'

const ADMIN_ROLES = ['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'DEPARTMENT_HEAD']

const bodySchema = z.object({
  /** Optional list of specific request IDs. If omitted, approves ALL pending the user can act on. */
  ids: z.array(z.string()).optional(),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error' }, { status: 422 })
  }

  const where: Record<string, unknown> = {
    companyId: ctx.companyId,
    status: 'PENDING',
    ...(parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : {}),
  }

  const pendingCorrections = await prisma.timeEntryCorrection.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          departmentId: true,
          companyId: true,
        },
      },
    },
    take: 500, // Safety cap
  })

  if (pendingCorrections.length === 0) {
    return NextResponse.json({ approved: 0 })
  }

  // Check legacy permission once
  const legacyCanApprove =
    ADMIN_ROLES.includes(ctx.role) || (await ctxHasPermission(ctx, 'corrections:approve'))

  // Resolve workflows by department (cached per department)
  const workflowCache = new Map<string, Awaited<ReturnType<typeof resolveWorkflow>>>()

  let approved = 0
  const approvedIds: string[] = []

  for (const correction of pendingCorrections) {
    const departmentId = correction.employee?.departmentId ?? null
    const workflowKey = departmentId ?? '__none__'

    if (!workflowCache.has(workflowKey)) {
      workflowCache.set(
        workflowKey,
        await resolveWorkflow({
          companyId: ctx.companyId,
          type: 'TIME_CORRECTION',
          departmentId,
        }),
      )
    }
    const workflow = workflowCache.get(workflowKey) ?? null

    // Determine if user can approve this correction
    let canAct = false
    if (!workflow) {
      canAct = legacyCanApprove
    } else {
      const currentLevel = correction.approvalLevel ?? 0
      const plan = buildPlan(workflow, {
        departmentId: departmentId ?? '',
      })
      const advance = await authorizeAdvance({
        plan,
        currentLevel,
        actorUserId: ctx.userId,
        requesterDepartmentId: departmentId,
        requesterEmployeeId: correction.employeeId,
      })
      canAct = advance.noChain || advance.authorized
    }

    if (!canAct) continue

    // Apply DTR changes (same logic as single approve)
    const targetDtr = correction.dtrRecordId
      ? await prisma.dTRRecord.findFirst({
          where: { id: correction.dtrRecordId, employeeId: correction.employee.id },
        })
      : await prisma.dTRRecord.findFirst({
          where: { employeeId: correction.employee.id, date: correction.date },
          orderBy: { createdAt: 'desc' },
        })

    const corrDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(correction.date)

    function toDateTime(timeStr: string | null): Date | null {
      if (!timeStr) return null
      return new Date(`${corrDate}T${timeStr}:00+08:00`)
    }

    const reqTimeIn = toDateTime(correction.timeIn)
    const reqTimeOut = toDateTime(correction.timeOut)
    const reqBreakIn = toDateTime(correction.breakIn)
    const reqBreakOut = toDateTime(correction.breakOut)

    if (targetDtr) {
      const newTimeIn = reqTimeIn ?? targetDtr.timeIn
      const newTimeOut = reqTimeOut ?? targetDtr.timeOut
      const newBreakIn = reqBreakIn ?? targetDtr.breakIn
      const newBreakOut = reqBreakOut ?? targetDtr.breakOut

      await prisma.dTRRecord.update({
        where: { id: targetDtr.id },
        data: {
          ...(newTimeIn ? { timeIn: newTimeIn } : {}),
          ...(newTimeOut !== undefined ? { timeOut: newTimeOut } : {}),
          ...(newBreakIn !== undefined ? { breakIn: newBreakIn } : {}),
          ...(newBreakOut !== undefined ? { breakOut: newBreakOut } : {}),
        },
      })
    } else {
      await prisma.dTRRecord.create({
        data: {
          employeeId: correction.employee.id,
          date: correction.date,
          timeIn: reqTimeIn ?? undefined,
          timeOut: reqTimeOut ?? undefined,
          breakIn: reqBreakIn ?? undefined,
          breakOut: reqBreakOut ?? undefined,
          source: 'MANUAL_CORRECTION',
          remarks: `Created from manual time correction request (${correction.id}).`,
        },
      })
    }

    // Update correction status
    await prisma.timeEntryCorrection.update({
      where: { id: correction.id },
      data: {
        status: 'APPROVED',
        reviewedBy: ctx.userId,
        reviewedAt: new Date(),
      },
    })

    approved++
    approvedIds.push(correction.id)
  }

  // Single audit log for bulk action
  if (approved > 0) {
    logAudit(ctx, 'BULK_APPROVE', 'TimeCorrection', approvedIds[0], {
      description: `Bulk approved ${approved} time correction${approved === 1 ? '' : 's'}`,
      newValues: { approvedCount: approved, ids: approvedIds },
    }).catch(() => {})
  }

  return NextResponse.json({ approved, total: pendingCorrections.length })
}
