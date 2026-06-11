import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { syncAutoOvertimeRequestsForCompany } from '@/lib/overtime-requests'
import { authorizeAdvance, buildPlan, resolveWorkflow } from '@/lib/approvals/engine'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { z } from 'zod'

const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

const createSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  hours: z.number().positive(),
  reason: z.string().min(1),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const employeeId = searchParams.get('employeeId') || undefined
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')

  // Fire-and-forget: sync auto-OT from DTR records in the background.
  // DTR upserts already sync OT per-record — this is a safety net that
  // shouldn't block the response. It runs at most once per page load.
  const syncFrom = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
  const syncTo = dateTo ? new Date(dateTo) : new Date()
  syncAutoOvertimeRequestsForCompany({
    companyId: ctx.companyId,
    dateFrom: syncFrom,
    dateTo: syncTo,
  }).catch(() => {})

  const where: Record<string, unknown> = { companyId: ctx.companyId }
  if (status) where.status = status
  if (employeeId) where.employeeId = employeeId
  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo && { lte: new Date(dateTo) }),
    }
  }

  const [requests, total] = await Promise.all([
    prisma.overtimeRequest.findMany({
      where,
      include: {
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
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.overtimeRequest.count({ where }),
  ])

  const legacyCanApprove = await ctxHasPermission(ctx, 'overtime:approve')
  const workflowByDepartment = new Map<string, ReturnType<typeof resolveWorkflow>>()
  const requestsWithAuthorization = await Promise.all(requests.map(async request => {
    if (request.status !== 'PENDING') {
      return { ...request, canAct: false, actionDisabledReason: undefined }
    }

    const departmentId = request.employee?.departmentId ?? null
    const workflowKey = departmentId ?? ''
    let workflowPromise = workflowByDepartment.get(workflowKey)
    if (!workflowPromise) {
      workflowPromise = resolveWorkflow({
        companyId: ctx.companyId,
        type: 'OVERTIME',
        departmentId,
      })
      workflowByDepartment.set(workflowKey, workflowPromise)
    }

    const workflow = await workflowPromise
    if (!workflow) {
      return {
        ...request,
        canAct: legacyCanApprove,
        actionDisabledReason: legacyCanApprove ? undefined : 'You do not have permission to approve overtime requests',
      }
    }

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
    const canAct = advance.noChain || advance.authorized

    return {
      ...request,
      canAct,
      actionDisabledReason: canAct
        ? undefined
        : advance.currentStep
          ? 'Not authorized for this approval level'
          : `No approver configured for level ${currentLevel + 1}`,
    }
  }))

  return NextResponse.json({ requests: requestsWithAuthorization, total, page, limit })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { employeeId, date, startTime, endTime, hours, reason } = parsed.data

  // Verify employee belongs to company
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: ctx.companyId },
  })
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }

  const request = await prisma.overtimeRequest.create({
    data: {
      companyId: ctx.companyId,
      employeeId,
      date: new Date(date),
      startTime,
      endTime,
      hours,
      reason,
      status: 'PENDING',
    },
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

  logAudit(ctx, 'CREATE', 'OvertimeRequest', request.id, {
    description: `${request.employee?.firstName ?? ''} ${request.employee?.lastName ?? ''} filed an overtime request`.trim(),
  }).catch(() => {})

  return NextResponse.json({ request }, { status: 201 })
}
