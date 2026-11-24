import { timezone, zonedDate, scheduleInstants } from '@/lib/attendance/timezone'
import { parseScheduleWeek } from '@/lib/attendance/schedule-week'
import { getManilaDateOnly } from '@/lib/date-manila'
import { scheduleDays } from '@/lib/attendance/schedule-display'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'
export async function GET(req: NextRequest){
 const {ctx,error}=await requireAuth(undefined,req);if(error)return error
 const id=await resolvePortalEmployeeId(ctx)
 const employee=id?await prisma.employee.findFirst({where:{id,companyId:ctx.companyId,isActive:true},include:{workSchedule:true}}):null
 if(!employee)return NextResponse.json({error:'Employee not found.'},{status:404})
 let zone=timezone(employee.workSchedule?.timezone)
 const week=req.nextUrl?.searchParams.get('week')
 let start=week!==undefined&&week!==null?parseScheduleWeek(week):zonedDate(new Date(),zone)
 if(!start)return NextResponse.json({error:'Choose a valid week (YYYY-MM-DD).'}, {status:400})
 const count=week!==undefined&&week!==null?7:14
 const end=new Date(start.getTime()+(count-1)*86400000)
 const assignments=await prisma.employeeShiftAssignment.findMany({where:{companyId:ctx.companyId,employeeId:employee.id,date:week!==undefined&&week!==null?{gte:start,lte:end}:{gte:new Date(start.getTime()-2*86400000),lte:new Date(end.getTime()+2*86400000)}},include:{schedule:true},orderBy:[{date:'asc'},{id:'asc'}]})
 if(week===undefined||week===null){
  const now=new Date()
  const candidates=assignments.filter(a=>{const local=zonedDate(now,timezone(a.schedule?.timezone??zone));const bounds=scheduleInstants(a.date,a.timeIn??a.schedule?.timeIn,a.timeOut??a.schedule?.timeOut,timezone(a.schedule?.timezone??zone));return !a.isRestDay&&(a.date.getTime()===local.getTime()||(bounds.scheduledStart&&bounds.scheduledEnd&&now>=bounds.scheduledStart&&now<=bounds.scheduledEnd))})
  candidates.sort((a,b)=>{const distance=(v:typeof a)=>{const start=scheduleInstants(v.date,v.timeIn??v.schedule?.timeIn,v.timeOut??v.schedule?.timeOut,timezone(v.schedule?.timezone??zone)).scheduledStart;return start?Math.abs(now.getTime()-start.getTime()):Infinity};return distance(a)-distance(b)})
  if(candidates[0]){zone=timezone(candidates[0].schedule?.timezone??zone);start=candidates[0].date}
 }
 const days=scheduleDays(start,assignments,employee.workSchedule,count)
 const leaves=week!==undefined&&week!==null?await prisma.leaveRequest.findMany({where:{employeeId:employee.id,status:'APPROVED',startDate:{lte:end},endDate:{gte:start}},select:{startDate:true,endDate:true,isHalfDay:true,halfDayPeriod:true,leaveType:{select:{name:true}}}}):[]
 const weeklyDays=days.map(day=>({...day,leaves:leaves.filter(leave=>leave.startDate.toISOString().slice(0,10)<=day.date&&leave.endDate.toISOString().slice(0,10)>=day.date).map(leave=>({name:leave.leaveType.name,period:leave.isHalfDay?(leave.halfDayPeriod??'AM'):'FULL'}))}))
 return NextResponse.json({enabled:false,readOnly:true,days:weeklyDays,today:zonedDate(new Date(),zone).toISOString().slice(0,10)},{headers:{'Cache-Control':'private, no-store'}})
}
export async function PATCH(){const a=await requireAuth();if(a.error)return a.error;return NextResponse.json({error:'Only administrators can change assigned schedules.'},{status:410})}
