import { customHalfDayWindow } from '@/lib/attendance/custom-half-day'
import { halfDayOptions } from '@/lib/attendance/half-day-leave'
import { scheduleDays } from '@/lib/attendance/schedule-display'
import { leaveDatesSchema, countLeaveDays } from '@/lib/leaves/duration'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
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
  totalDays: z.unknown().optional(), // Legacy clients may send 0; the server calculates the actual duration.
  isHalfDay: z.boolean().optional(),
  halfDayStart: z.string().optional(),
  halfDayEnd: z.string().optional(),
  halfDayPeriod: z.enum(['AM', 'PM']).optional().nullable(),
  reason: z.string().optional().nullable(),
  employeeId: z.string().optional(), // HR can file on behalf
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true },
    select: { id: true },
  })
  const employeeId = employee?.id ?? null

  const { searchParams } = new URL(req.url)
  if(searchParams.get('duration')==='true'){
    if(!employeeId)return NextResponse.json({error:'No active employee profile found.'},{status:400})
    const dates=leaveDatesSchema.safeParse({startDate:searchParams.get('startDate'),endDate:searchParams.get('endDate'),isHalfDay:searchParams.get('isHalfDay')==='true'})
    if(!dates.success)return NextResponse.json({error:dates.error.issues[0].message},{status:422})
    const preview=await leaveDuration(ctx.companyId,employeeId,dates.data.startDate,dates.data.endDate,!!dates.data.isHalfDay)
    return NextResponse.json(preview,{headers:{'Cache-Control':'private, no-store'}})
  }
  const requestedYear=Number(searchParams.get('year')??new Date().getFullYear())
  if(!Number.isInteger(requestedYear)||requestedYear<2000||requestedYear>2100)return NextResponse.json({error:'Choose a valid leave year.'},{status:422})
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
      where: { employeeId, year: requestedYear, leaveType: { companyId: ctx.companyId, isActive: true } },
      include: { leaveType: { select: { name: true, code: true, isWithPay: true } } },
    })
    return NextResponse.json({ leaves, balances, total, page, limit }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  return NextResponse.json({ leaves, requests: leaves, total, page, limit })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true },
    select: { id: true },
  })
  const employeeId = employee?.id ?? null

  const body = await req.json()
  const parsed = createLeaveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '), details: parsed.error.flatten() }, { status: 422 })
  }

  const { leaveTypeId, startDate, endDate, reason, employeeId: targetEmployeeId, isHalfDay, halfDayPeriod, halfDayStart, halfDayEnd } = parsed.data
  const finalEmployeeId = targetEmployeeId || employeeId
  if (targetEmployeeId && targetEmployeeId !== employeeId) {
    if (ctx.role === 'EMPLOYEE' || !await ctxHasPermission(ctx, 'leaves:write')) return NextResponse.json({ error: 'You may only submit leave for yourself.' }, { status: 403 })
    const target = await prisma.employee.findFirst({ where: { id: targetEmployeeId, companyId: ctx.companyId, isActive: true }, select: { id: true } })
    if (!target) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 })
  }

  if (!finalEmployeeId) return NextResponse.json({ error: 'No active employee profile found for this user.' }, { status: 400 })
  const dates=leaveDatesSchema.safeParse({startDate,endDate,isHalfDay})
  if(!dates.success)return NextResponse.json({error:dates.error.issues[0].message},{status:422})
  const year=Number(startDate.slice(0,4))
  const {totalDays,halfDayShifts}=await leaveDuration(ctx.companyId,finalEmployeeId,startDate,endDate,!!isHalfDay)
  if(totalDays<=0)return NextResponse.json({error:'No scheduled working days in this date range. Choose a workday or ask HR to correct your schedule.'},{status:422})

  let customWindow: ReturnType<typeof customHalfDayWindow> | undefined
  if(isHalfDay && (halfDayStart!==undefined || halfDayEnd!==undefined)){
    if(halfDayShifts.length!==1)return NextResponse.json({error:'Custom half-day hours require one scheduled shift for this date. Ask HR to confirm your schedule.'},{status:422})
    try { customWindow=customHalfDayWindow(new Date(startDate+'T00:00:00Z'),halfDayShifts[0].schedule,halfDayStart??'',halfDayEnd??'') }
    catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Invalid leave hours.'},{status:422})}
  }
  const activeType = await prisma.leaveType.findFirst({ where: { id: leaveTypeId, companyId: ctx.companyId, isActive: true }, select: { id: true } })
  if (!activeType) return NextResponse.json({ error: 'This leave type is no longer available. Refresh and choose an active leave type.' }, { status: 400 })

  // Check leave balance
  const balance = await prisma.leaveBalance.findFirst({
    where: {
      employeeId: finalEmployeeId,
      leaveTypeId,
      year,
    },
  })

  const available = balance
    ? balance.entitled.toNumber() + balance.carriedOver.toNumber() - balance.used.toNumber() - balance.pending.toNumber() - balance.encashed.toNumber()
    : 0

  if (available < totalDays) {
    return NextResponse.json({
      error: `Insufficient leave balance. Available: ${available} days, Requested: ${totalDays} days`,
    }, { status: 400 })
  }

  const leaveRequest = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "leave_balances" WHERE "id" = ${balance!.id} FOR UPDATE`
    const current = await tx.leaveBalance.findUniqueOrThrow({ where: { id: balance!.id } })
    const remaining = Number(current.entitled) + Number(current.carriedOver) - Number(current.used) - Number(current.pending) - Number(current.encashed)
    if (remaining < totalDays!) return null
    const req = await tx.leaveRequest.create({
      data: {
        employeeId: finalEmployeeId,
        leaveTypeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalDays,
        isHalfDay: isHalfDay ?? false,
        halfDayPeriod: isHalfDay ? (customWindow ? 'CUSTOM' : halfDayPeriod ?? 'AM') : null,
        ...(customWindow?{halfDayWindow:customWindow}:{}),
        reason,
        status: 'PENDING',
      },
    })

    // Update pending balance
    await tx.leaveBalance.updateMany({
      where: { employeeId: finalEmployeeId, leaveTypeId, year },
      data: { pending: { increment: totalDays }, updatedAt: new Date() },
    })

    return req
  })

  if (!leaveRequest) return NextResponse.json({ error: 'Leave balance changed. Please refresh and try again.' }, { status: 409 })

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
        link: `/leaves?requestId=${leaveRequest.id}`,
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
            link: `/leaves?requestId=${leaveRequest.id}`,
          })
        }
      }
    }
    logAudit(ctx, 'CREATE', 'LeaveRequest', leaveRequest.id, {
      description: `${requesterName} filed a ${lt?.name ?? 'leave'} request`,
    }).catch(() => {})
  } catch (err) {
    console.error('[leaves POST] workflow submit notifications failed', err)
    logAudit(ctx, 'CREATE', 'LeaveRequest', leaveRequest.id, {
      description: 'Filed a leave request',
    }).catch(() => {})
  }

  return NextResponse.json({ leaveRequest }, { status: 201 })
}

async function leaveDuration(companyId:string,employeeId:string,startDate:string,endDate:string,isHalfDay:boolean){
 const start=new Date(startDate+'T00:00:00Z'),end=new Date(endDate+'T00:00:00Z')
 const [employee,assignments]=await Promise.all([
  prisma.employee.findFirst({where:{id:employeeId,companyId,isActive:true},include:{workSchedule:true}}),
  prisma.employeeShiftAssignment.findMany({where:{employeeId,companyId,date:{gte:start,lte:end}},include:{schedule:true}}),
 ])
 const shifts=scheduleDays(start,assignments,employee?.workSchedule??null,1)[0].shifts.filter(s=>!s.isRestDay)
 const options=shifts.map(shift=>({name:shift.name,schedule:{timeIn:shift.timeIn,timeOut:shift.timeOut,breakMinutes:shift.breakMinutes??0,timezone:shift.timezone},options:halfDayOptions({...shift,breakMinutes:shift.breakMinutes??0})}))
 return {totalDays:countLeaveDays(startDate,endDate,isHalfDay,assignments,employee?.workSchedule??null),halfDayShifts:options}
}
