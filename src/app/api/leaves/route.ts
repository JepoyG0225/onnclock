import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { createNotificationsForUsers } from '@/lib/notifications'
import {
  resolveWorkflow,
  buildPlan,
  resolveApprovers,
  notifyStepsOnSubmit,
  type RequestFacts,
} from '@/lib/approvals/engine'
import { dispatchNotifySteps } from '@/lib/approvals/notify'

const createLeaveSchema = z.object({
  leaveTypeId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  totalDays: z.number().positive().optional(),
  isHalfDay: z.boolean().optional(),
  halfDayPeriod: z.enum(['AM', 'PM']).optional().nullable(),
  reason: z.string().optional().nullable(),
  employeeId: z.string().optional(), // HR can file on behalf
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })
  const employeeId = employee?.id ?? null

  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status') || undefined
  const ownOnly = searchParams.get('own') === 'true'
  const page    = parseInt(searchParams.get('page') || '1')
  const limit   = parseInt(searchParams.get('limit') || '20')

  const isHR = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN'].includes(ctx.role ?? '')

  // If ownOnly is requested but there's no linked employee, return empty gracefully
  if (ownOnly && !employeeId) {
    return NextResponse.json({ leaves: [], balances: [], total: 0, page, limit })
  }

  const where: Record<string, unknown> = {
    ...(status && { status }),
    ...(isHR && !ownOnly
      ? { employee: { companyId: ctx.companyId } }
      : { employeeId }
    ),
  }

  const [leaves, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNo: true,
            department: { select: { name: true } },
          },
        },
        leaveType: { select: { name: true, code: true, isWithPay: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.leaveRequest.count({ where }),
  ])

  // For employee self-service: include balances
  if (ownOnly && employeeId) {
    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId, year: new Date().getFullYear() },
      include: { leaveType: { select: { name: true, code: true } } },
    })
    return NextResponse.json({ leaves, balances, total, page, limit })
  }

  return NextResponse.json({ leaves, requests: leaves, total, page, limit })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })
  const employeeId = employee?.id ?? null

  const body = await req.json()
  const parsed = createLeaveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { leaveTypeId, startDate, endDate, reason, employeeId: targetEmployeeId, isHalfDay, halfDayPeriod } = parsed.data
  const finalEmployeeId = targetEmployeeId || employeeId

  // Half-day: always 0.5 days, start === end
  // Full day(s): count working days between start and end
  let totalDays = parsed.data.totalDays
  if (!totalDays) {
    if (isHalfDay) {
      totalDays = 0.5
    } else {
      const start = new Date(startDate)
      const end   = new Date(endDate)
      let days = 0
      const cur = new Date(start)
      while (cur <= end) {
        const dow = cur.getDay()
        if (dow !== 0 && dow !== 6) days++
        cur.setDate(cur.getDate() + 1)
      }
      totalDays = Math.max(1, days)
    }
  }

  if (!finalEmployeeId) {
    return NextResponse.json({ error: 'No employee found for this user' }, { status: 400 })
  }

  // Check leave balance
  const balance = await prisma.leaveBalance.findFirst({
    where: {
      employeeId: finalEmployeeId,
      leaveTypeId,
      year: new Date().getFullYear(),
    },
  })

  const available = balance ? (balance.entitled.toNumber() - balance.used.toNumber() - balance.pending.toNumber()) : 0

  if (available < totalDays) {
    return NextResponse.json({
      error: `Insufficient leave balance. Available: ${available} days, Requested: ${totalDays} days`,
    }, { status: 400 })
  }

  const leaveRequest = await prisma.$transaction(async (tx) => {
    const req = await tx.leaveRequest.create({
      data: {
        employeeId: finalEmployeeId,
        leaveTypeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalDays,
        isHalfDay: isHalfDay ?? false,
        halfDayPeriod: isHalfDay ? (halfDayPeriod ?? 'AM') : null,
        reason,
        status: 'PENDING',
      },
    })

    // Update pending balance
    await tx.leaveBalance.updateMany({
      where: { employeeId: finalEmployeeId, leaveTypeId, year: new Date().getFullYear() },
      data: { pending: { increment: totalDays }, updatedAt: new Date() },
    })

    return req
  })

  // Best-effort: route the new request through its workflow to ping the first
  // approver and fire any on-submit NOTIFY steps. Never blocks the response.
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: finalEmployeeId },
      select: { departmentId: true, firstName: true, lastName: true },
    })
    const lt = await prisma.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { name: true, isWithPay: true },
    })
    const requesterDepartmentId = emp?.departmentId ?? null
    const requesterName = `${emp?.firstName ?? ''} ${emp?.lastName ?? ''}`.trim() || 'An employee'

    const workflow = await resolveWorkflow({
      companyId: ctx.companyId,
      type: 'LEAVE',
      departmentId: requesterDepartmentId,
    })
    if (workflow) {
      const facts: RequestFacts = {
        totalDays,
        leaveType: lt?.name ?? '',
        isWithPay: !!lt?.isWithPay,
        isHalfDay: isHalfDay ?? false,
        departmentId: requesterDepartmentId ?? '',
      }
      const plan = buildPlan(workflow, facts)
      const notifyCtx = {
        companyId: ctx.companyId,
        requesterEmployeeId: finalEmployeeId,
        requesterDepartmentId,
        link: '/leaves',
        vars: { requestType: 'Leave', requesterName, leaveType: lt?.name ?? 'Leave' },
      }
      await dispatchNotifySteps(notifyStepsOnSubmit(plan), notifyCtx)

      const firstApproval = plan.approvalSteps[0]
      if (firstApproval) {
        const approvers = await resolveApprovers(firstApproval, {
          companyId: ctx.companyId,
          requesterDepartmentId,
        })
        if (approvers.length > 0) {
          await createNotificationsForUsers(approvers, {
            companyId: ctx.companyId,
            type: 'GENERIC',
            title: 'Leave request awaiting your approval',
            body: `${requesterName} · ${lt?.name ?? 'Leave'}`,
            link: '/leaves',
          })
        }
      }
    }
  } catch (err) {
    console.error('[leaves POST] workflow submit notifications failed', err)
  }

  logAudit(ctx, 'CREATE', 'LeaveRequest', leaveRequest.id, {
    description: `${requesterName} filed a ${lt?.name ?? 'leave'} request`,
  }).catch(() => {})

  return NextResponse.json({ leaveRequest }, { status: 201 })
}
