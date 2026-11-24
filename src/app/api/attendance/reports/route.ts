import { missingAttendanceDays } from '@/lib/attendance/report-absence'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { activityScope, listActivities, monthRange, reportDayRange, numberActivities } from '@/lib/attendance/activities'
export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error
  let scope
  try { scope = await activityScope(ctx, true) } catch { return NextResponse.json({ error: 'Attendance report access is required.' }, { status: 403 }) }
  try {
    const from = req.nextUrl.searchParams.get('from'), to = req.nextUrl.searchParams.get('to')
    if (!!from !== !!to) throw new Error('Choose both a start and end date.')
    const reportDate = req.nextUrl.searchParams.get('date')
    const isActivityDay = !!(reportDate || from) && req.nextUrl.searchParams.get('type') === 'activities'
    const month = from?.slice(0, 7) ?? reportDate?.slice(0, 7) ?? req.nextUrl.searchParams.get('month') ?? ''
    const date = from && to ? { gte: reportDayRange(from).gte, lt: reportDayRange(to).lt } : reportDate ? reportDayRange(reportDate) : monthRange(month), employeeId = req.nextUrl.searchParams.get('employeeId'), departmentId = req.nextUrl.searchParams.get('departmentId')
    if (date.lt <= date.gte || date.lt.getTime()-date.gte.getTime()>366*86400000) throw new Error('Choose a date range of up to 366 days with the end on or after the start.')
    if (req.nextUrl.searchParams.get('type') === 'activities' && !employeeId && !reportDate) return NextResponse.json({ error: 'Select one employee for a monthly or date-range daily activity report.' }, { status: 400 })
    const employeeWhere = { AND: [scope, ...(employeeId ? [{ id: employeeId }] : []), ...(departmentId ? [{ departmentId }] : [])] }
    const employees = await prisma.employee.findMany({ where: req.nextUrl.searchParams.get('options') === '1' ? scope : employeeWhere, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true, employeeNo: true, department: { select: { name: true } } } })
    if (req.nextUrl.searchParams.get('options') === '1') {
      const departments = await prisma.department.findMany({ where: { companyId: ctx.companyId, ...(ctx.managedDepartmentId ? { id: ctx.managedDepartmentId } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      return NextResponse.json({ employees, departments })
    }
    const loggedAt = isActivityDay ? (from && to ? { gte: reportDayRange(from, true).gte, lt: reportDayRange(to, true).lt } : reportDayRange(reportDate!, true)) : undefined
    const where = { employee: employeeWhere, ...(loggedAt ? { activities: { some: { loggedAt } } } : { date }) }
    const activityWhere = { dtrRecord: where, ...(loggedAt ? { loggedAt } : {}) }
    const [count, activityCount] = await Promise.all([prisma.dTRRecord.count({ where }), prisma.attendanceActivity.count({ where: activityWhere })])
    if (count > 10000 || activityCount > 10000) return NextResponse.json({ error: 'This report is too large. Select an employee or department.' }, { status: 400 })
    const [records, activities, company] = await Promise.all([
      prisma.dTRRecord.findMany({ where, orderBy: [{ date: 'asc' }, { timeIn: 'asc' }, { id: 'asc' }], select: { id: true, employeeId: true, date: true, timeIn: true, timeOut: true, regularHours: true, overtimeHours: true, nightDiffHours: true, lateMinutes: true, undertimeMinutes: true, isAbsent: true, isLeave: true, isRestDay: true, isHoliday: true, approvedBy: true } }),
      listActivities(activityWhere, 10001), prisma.company.findUnique({ where: { id: ctx.companyId }, select: { name: true } }),
    ])
    const numbered = await numberActivities(activities, scope)
    const grouped = new Map<string, typeof numbered>()
    for (const activity of numbered) { const list = grouped.get(activity.dtrRecordId) ?? []; list.push(activity); grouped.set(activity.dtrRecordId, list) }
    let inferred: ReturnType<typeof missingAttendanceDays> = []
    if (req.nextUrl.searchParams.get('type') !== 'activities') {
      if (employees.length * ((date.lt.getTime()-date.gte.getTime())/86400000) > 100000) throw new Error('Select a shorter range or a department.')
      const ids = employees.map(e=>e.id)
      const [profiles, shifts, leaves, holidays] = await Promise.all([
        prisma.employee.findMany({where:{id:{in:ids},companyId:ctx.companyId},select:{id:true,hireDate:true,terminationDate:true,isActive:true,trackTime:true,workSchedule:{select:{timezone:true,workDays:true,timeIn:true,timeOut:true}}}}),
        prisma.employeeShiftAssignment.findMany({where:{employeeId:{in:ids},companyId:ctx.companyId,date},select:{employeeId:true,date:true,isRestDay:true,timeIn:true,timeOut:true,schedule:{select:{timezone:true,timeIn:true,timeOut:true}}}}),
        prisma.leaveRequest.findMany({where:{employeeId:{in:ids},status:'APPROVED',startDate:{lt:date.lt},endDate:{gte:date.gte}},select:{employeeId:true,startDate:true,endDate:true,isHalfDay:true}}),
        prisma.holiday.findMany({where:{companyId:ctx.companyId,date},select:{date:true}}),
      ])
      inferred = missingAttendanceDays(profiles,records,shifts,leaves,holidays.map(h=>h.date),date)
    }
    return NextResponse.json({ companyName: company?.name, month, reportDate, rangeStart: from, rangeEnd: to, generatedAt: new Date(), employees,
      records: [...records.map(r => ({ ...r, regularHours: Number(r.regularHours ?? 0), overtimeHours: Number(r.overtimeHours ?? 0), nightDiffHours: Number(r.nightDiffHours ?? 0), lateMinutes: r.lateMinutes ?? 0, undertimeMinutes: r.undertimeMinutes ?? 0, activities: grouped.get(r.id) ?? [] })), ...inferred].sort((a,b)=>a.date.getTime()-b.date.getTime()) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not generate attendance report.' }, { status: 400 }) }
}
