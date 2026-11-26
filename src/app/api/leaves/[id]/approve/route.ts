import { halfDayWorkedShift } from '@/lib/attendance/half-day-leave'
import { computeHours, computeLateAndUndertime, getCompanyNightDiffWindow } from '@/lib/timesheet/compute'
import { leaveWorkDates } from '@/lib/leaves/duration'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { Prisma } from '@prisma/client'
import { createNotification, createNotificationsForUsers, userIdForEmployee } from '@/lib/notifications'
import {
  resolveWorkflow,
  buildPlan,
  authorizeAdvance,
  resolveApprovers,
  notifyStepsOnApprove,
  type RequestFacts,
} from '@/lib/approvals/engine'
import { dispatchNotifySteps } from '@/lib/approvals/notify'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { action, notes } = await req.json() // action: 'approve' | 'reject'

  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      leaveTypeId: true,
      startDate: true,
      endDate: true,
      totalDays: true,
      isHalfDay: true,
      halfDayPeriod: true,
      halfDayWindow: true,
      status: true,
      approvalLevel: true,
      reviewedBy: true,
      reviewedAt: true,
      reviewNotes: true,
      employee: true,
      leaveType: { select: { isWithPay: true, name: true } },
    },
  })

  if (!leaveRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (leaveRequest.status !== 'PENDING') {
    return NextResponse.json({ error: 'Leave request is not pending' }, { status: 400 })
  }

  const employee = leaveRequest.employee as { departmentId?: string | null; firstName?: string | null; lastName?: string | null } | null
  const requesterDepartmentId = employee?.departmentId ?? null
  const requesterName = `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim() || 'An employee'

  const currentLevel = leaveRequest.approvalLevel ?? 0
  let nextLevel: number
  let isFinal: boolean

  // Prefer the configurable workflow engine (per-department, conditional).
  // Fall back to the legacy company-wide ApproverConfig chain for companies
  // that haven't built a workflow yet, so nothing breaks on rollout.
  const workflow = await resolveWorkflow({
    companyId: ctx.companyId,
    type: 'LEAVE',
    departmentId: requesterDepartmentId,
  })

  const facts: RequestFacts = {
    totalDays: leaveRequest.totalDays.toNumber(),
    leaveType: leaveRequest.leaveType?.name ?? '',
    isWithPay: !!leaveRequest.leaveType?.isWithPay,
    isHalfDay: !!leaveRequest.isHalfDay,
    departmentId: requesterDepartmentId ?? '',
  }

  const plan = workflow ? buildPlan(workflow, facts) : null

  if (plan) {
    const adv = await authorizeAdvance({
      plan,
      currentLevel,
      actorUserId: ctx.userId,
      requesterDepartmentId,
      requesterEmployeeId: leaveRequest.employeeId,
    })
    if (action === 'approve' && !adv.noChain && !adv.authorized) {
      return NextResponse.json({ error: 'Not authorized for this approval level' }, { status: 403 })
    }
    nextLevel = adv.nextLevel
    isFinal = action === 'approve' ? adv.isFinal : true
  } else {
    const approvers = await prisma.approverConfig.findMany({
      where: { companyId: ctx.companyId, type: 'LEAVE' },
      orderBy: { level: 'asc' },
    })
    const maxLevel = approvers.length
    nextLevel = currentLevel + 1
    const expectedApprover = approvers.find(a => a.level === nextLevel)
    if (action === 'approve' && maxLevel > 0) {
      if (!expectedApprover || expectedApprover.userId !== ctx.userId) {
        return NextResponse.json({ error: 'Not authorized for this approval level' }, { status: 403 })
      }
    }
    isFinal = action === 'approve' ? (maxLevel === 0 || nextLevel >= maxLevel) : true
  }

  const newStatus = action === 'approve'
    ? (isFinal ? 'APPROVED' : 'PENDING')
    : 'REJECTED'

  let prevTrail: unknown[] = []
  try {
    const trailRow = await prisma.leaveRequest.findUnique({
      where: { id },
      select: { approvalTrail: true },
    })
    prevTrail = Array.isArray(trailRow?.approvalTrail) ? trailRow?.approvalTrail : []
  } catch {
    prevTrail = []
  }
  const trailEntry = {
    level: nextLevel,
    userId: ctx.userId,
    action,
    notes: notes ?? null,
    at: new Date().toISOString(),
  }

  try {
    const ndWindow = leaveRequest.halfDayWindow ? await getCompanyNightDiffWindow(ctx.companyId) : null
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: newStatus,
          approvalLevel: action === 'approve' ? nextLevel : currentLevel,
          approvalTrail: [...prevTrail, trailEntry] as Prisma.InputJsonValue,
          reviewedBy: action === 'approve' && !isFinal ? leaveRequest.reviewedBy : ctx.userId,
          reviewedAt: action === 'approve' && !isFinal ? leaveRequest.reviewedAt : new Date(),
          reviewNotes: action === 'approve' && !isFinal ? leaveRequest.reviewNotes : notes,
        },
      })

    if (action === 'approve' && isFinal) {
      // Move from pending to used
      await tx.leaveBalance.updateMany({
        where: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year: leaveRequest.startDate.getFullYear(),
        },
        data: {
          used: { increment: leaveRequest.totalDays.toNumber() },
          pending: { decrement: leaveRequest.totalDays.toNumber() },
          updatedAt: new Date(),
        },
      })

      // Use the same scheduled working dates as leave submission, including weekends.
      const [scheduledEmployee,assignments]=await Promise.all([
        tx.employee.findUnique({where:{id:leaveRequest.employeeId},include:{workSchedule:true}}),
        tx.employeeShiftAssignment.findMany({where:{employeeId:leaveRequest.employeeId,companyId:ctx.companyId,date:{gte:leaveRequest.startDate,lte:leaveRequest.endDate}},include:{schedule:true}}),
      ])
      const dates=leaveWorkDates(leaveRequest.startDate.toISOString().slice(0,10),leaveRequest.endDate.toISOString().slice(0,10),assignments,scheduledEmployee?.workSchedule??null)

      const isPaid     = !!leaveRequest.leaveType?.isWithPay
      const typeName   = leaveRequest.leaveType?.name ?? 'Leave'
      const isHalfDay  = leaveRequest.isHalfDay ?? false
      const halfPeriod = leaveRequest.halfDayPeriod ?? 'AM'
      const halfLabel  = isHalfDay ? ` (Half-day ${halfPeriod})` : ''
      const dtrRemarks = `Leave - ${typeName}${halfLabel}`

      const existing = await tx.dTRRecord.findMany({
        where: {
          employeeId: leaveRequest.employeeId,
          date: { in: dates },
        },
        select: { id: true, date: true, timeIn: true, timeOut: true, breakIn: true, breakOut: true },
      })
      const existingMap = new Map(existing.map(r => [r.date.toISOString().split('T')[0], r]))

      // Multi-shift: an employee can have multiple DTR rows per day. We update
      // ALL existing rows for that date so the leave flag is reflected on every
      // shift, and only create a fresh row when none exists for that date.
      for (const d of dates) {
        const key = d.toISOString().split('T')[0]
        const prev = existingMap.get(key)
        if (leaveRequest.halfDayWindow) {
          for (const row of existing.filter(r=>r.date.getTime()===d.getTime()&&r.timeIn)) {
            const metadata={isHalfDay:true,isLeave:false,halfDayPeriod:'CUSTOM',halfDayWindow:leaveRequest.halfDayWindow}
            const shift=halfDayWorkedShift({scheduleTimeIn:null,scheduleTimeOut:null,allowedBreakMinutes:0,plannedRegularMinutes:0},{...metadata,timeIn:row.timeIn,timeOut:row.timeOut})
            const computed=row.timeIn&&row.timeOut?{...computeHours(row.timeIn,row.timeOut,row.breakIn,row.breakOut,{...shift,nightDiffStartMins:ndWindow?.startMins,nightDiffEndMins:ndWindow?.endMins,nightDiffIncludesBreak:ndWindow?.includesBreak}),...computeLateAndUndertime(row.timeIn,row.timeOut,shift.scheduleTimeIn,shift.scheduleTimeOut,shift)}:{}
            await tx.dTRRecord.update({where:{id:row.id},data:{...metadata,...computed,approvedBy:null}})
          }
        } else if (prev && (prev.timeIn || prev.timeOut)) continue

        const dtrData = {
          isLeave:        true,
          isLeavePaid:    isPaid,
          isAbsent:       false,
          isHalfDay,
          ...(leaveRequest.halfDayWindow?{halfDayWindow:leaveRequest.halfDayWindow}:{}),
          halfDayPeriod:  isHalfDay ? halfPeriod : null,
          remarks:        dtrRemarks,
          leaveRequestId: leaveRequest.id,
        }

        const updateRes = await tx.dTRRecord.updateMany({
          where: {
            employeeId: leaveRequest.employeeId,
            date: d,
            timeIn: null,
            timeOut: null,
          },
          data: dtrData,
        })
        if (updateRes.count === 0) {
          await tx.dTRRecord.create({
            data: {
              employeeId: leaveRequest.employeeId,
              date: d,
              ...dtrData,
            },
          })
        }
      }
    } else if (action === 'reject') {
      // Restore pending balance on reject
      await tx.leaveBalance.updateMany({
        where: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year: leaveRequest.startDate.getFullYear(),
        },
        data: {
          pending: { decrement: leaveRequest.totalDays.toNumber() },
          updatedAt: new Date(),
        },
      })
    }
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
      return NextResponse.json(
        { error: 'Database schema is out of date. Run prisma migrate to add approval columns.' },
        { status: 500 },
      )
    }
    throw e
  }

  // Fire-and-forget notification to the employee.
  const recipientUserId = await userIdForEmployee(leaveRequest.employeeId)
  if (recipientUserId && (newStatus === 'APPROVED' || newStatus === 'REJECTED')) {
    const isApproved = newStatus === 'APPROVED'
    const start = leaveRequest.startDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    const end = leaveRequest.endDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    await createNotification({
      companyId: ctx.companyId,
      userId: recipientUserId,
      type: isApproved ? 'LEAVE_REQUEST_APPROVED' : 'LEAVE_REQUEST_REJECTED',
      title: isApproved ? 'Leave approved' : 'Leave rejected',
      body: `${leaveRequest.leaveType?.name ?? 'Leave'} · ${start} – ${end}${notes ? ` · ${notes}` : ''}`,
      link: '/portal/leaves',
    })
  }

  // Workflow engine NOTIFY steps + "your turn" hand-off (engine path, approve only).
  if (plan && action === 'approve') {
    const notifyCtx = {
      companyId: ctx.companyId,
      requesterEmployeeId: leaveRequest.employeeId,
      requesterDepartmentId,
      link: `/leaves?requestId=${leaveRequest.id}`,
      vars: {
        requestType: 'Leave',
        requesterName,
        leaveType: leaveRequest.leaveType?.name ?? 'Leave',
      },
    }
    await dispatchNotifySteps(notifyStepsOnApprove(plan, nextLevel, isFinal), notifyCtx)

    // Ping the next approver in the chain when approval continues.
    if (!isFinal) {
      const nextStep = plan.approvalSteps[nextLevel]
      if (nextStep) {
        const nextApprovers = await resolveApprovers(nextStep, {
          companyId: ctx.companyId,
          requesterDepartmentId,
        })
        if (nextApprovers.length > 0) {
          await createNotificationsForUsers(nextApprovers, {
            companyId: ctx.companyId,
            type: 'GENERIC',
            title: 'Leave request awaiting your approval',
            body: `${requesterName} · ${leaveRequest.leaveType?.name ?? 'Leave'}`,
            link: `/leaves?requestId=${leaveRequest.id}`,
          })
        }
      }
    }
  }

  logAudit(ctx, newStatus === 'APPROVED' ? 'APPROVE' : 'REJECT', 'LeaveRequest', id, {
    description: `${newStatus === 'APPROVED' ? 'Approved' : 'Rejected'} ${leaveRequest.leaveType?.name ?? 'leave'} request for ${requesterName}`,
    newValues: { status: newStatus },
  }).catch(() => {})

  return NextResponse.json({ success: true, status: newStatus })
}
