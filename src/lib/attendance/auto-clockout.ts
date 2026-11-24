import { halfDayWorkedShift } from './half-day-leave'
import { prisma } from '@/lib/prisma'
import { scheduledShiftEnd } from './shift-end'
import { computeHours,computeLateAndUndertime,resolveShiftForDtr,getCompanyNightDiffWindow } from '@/lib/timesheet/compute'
import { syncAutoOvertimeRequest } from '@/lib/overtime-requests'
export async function closeScheduledShifts(now=new Date()){
 const companies=await prisma.company.findMany({where:{shiftEndClockoutEnabled:true},select:{id:true,shiftEndClockoutEnabledAt:true,defaultBreakMinutes:true}})
 let closed=0,skipped=0
 for(const company of companies){
  if(!company.shiftEndClockoutEnabledAt)continue
  const nd=await getCompanyNightDiffWindow(company.id)
  let cursor:string|undefined
  // Cursor pagination prevents unscheduled open sessions from starving later sessions.
  for(let page=0;page<20;page++){
   const rows=await prisma.dTRRecord.findMany({where:{employee:{companyId:company.id,isActive:true,trackTime:true},timeIn:{not:null,gte:new Date(company.shiftEndClockoutEnabledAt.getTime()-86400000)},timeOut:null,...(cursor?{id:{gt:cursor}}:{})},include:{employee:{include:{workSchedule:true}}},orderBy:{id:'asc'},take:100})
   if(!rows.length)break
   for(const r of rows){
    cursor=r.id
    const shift=halfDayWorkedShift(await resolveShiftForDtr({employeeId:r.employeeId,date:r.date,actualTimeIn:r.timeIn,employee:r.employee,defaultBreakMinutes:company.defaultBreakMinutes??60}),r)
    const end=(shift.scheduledEnd ?? scheduledShiftEnd(r.date,r.timeIn!,shift.scheduleTimeIn,shift.scheduleTimeOut))
    if(!end||end>now||end<company.shiftEndClockoutEnabledAt){skipped++;continue}
    // Rest-day overrides are not automatically converted into a scheduled workday.
    if(!shift.matchedAssignment){const rest=await prisma.employeeShiftAssignment.count({where:{employeeId:r.employeeId,companyId:company.id,date:r.date,isRestDay:true}});const days=r.employee.workSchedule?.workDays;if(rest||(Array.isArray(days)&&!days.map(Number).includes(r.date.getUTCDay()))){skipped++;continue}}
    if((r.breakIn&&r.breakIn>end)||(r.breakOut&&r.breakOut>end)){skipped++;continue}
    const breakOut=r.breakIn?(r.breakOut??end):null
    const hours=computeHours(r.timeIn!,end,r.breakIn,breakOut,{plannedRegularMinutes:shift.plannedRegularMinutes,allowedBreakMinutes:shift.allowedBreakMinutes,nightDiffStartMins:nd.startMins,nightDiffEndMins:nd.endMins,nightDiffIncludesBreak:nd.includesBreak,scheduledStart: shift.scheduledStart, scheduledEnd: shift.scheduledEnd, scheduledTimeIn:shift.scheduleTimeIn,scheduledTimeOut:shift.scheduleTimeOut})
    const attendance=computeLateAndUndertime(r.timeIn!,end,shift.scheduleTimeIn,shift.scheduleTimeOut, shift)
    const actualBreak=r.breakIn&&breakOut?Math.max(0,(breakOut.getTime()-r.breakIn.getTime())/60000):0
    const overBreak=actualBreak<=720?Math.max(0,Math.floor(actualBreak)-shift.allowedBreakMinutes):0
    const result=await prisma.$transaction(async tx=>{
      // Serialize with manual punches and recheck the opt-in before changing attendance.
      await tx.$queryRaw`SELECT id FROM companies WHERE id=${company.id} FOR SHARE`
      const enabled=await tx.company.findUnique({where:{id:company.id},select:{shiftEndClockoutEnabled:true,shiftEndClockoutEnabledAt:true}})
      if(!enabled?.shiftEndClockoutEnabled||!enabled.shiftEndClockoutEnabledAt||end<enabled.shiftEndClockoutEnabledAt)return 0
      const saved=await tx.dTRRecord.updateMany({where:{id:r.id,timeIn:r.timeIn,timeOut:null,breakIn:r.breakIn,breakOut:r.breakOut,employee:{trackTime:true}},data:{timeOut:end,breakOut,...hours,lateMinutes:attendance.lateMinutes+overBreak,undertimeMinutes:attendance.undertimeMinutes,approvedBy:null,remarks:(r.remarks?r.remarks+'\n':'')+'[System] Automatically clocked out at scheduled shift end.'}})
      if(saved.count)await tx.auditLog.create({data:{companyId:company.id,userId:'SYSTEM',action:'AUTO_CLOCK_OUT',entity:'DTRRecord',entityId:r.id,newValues:{timeOut:end.toISOString(),reason:'Scheduled shift end'}}})
      return saved.count
    })
    if(result){closed++;await syncAutoOvertimeRequest({companyId:company.id,employeeId:r.employeeId,date:r.date,timeIn:r.timeIn,timeOut:end,overtimeHours:hours.overtimeHours})}
   }
   if(rows.length<100)break
  }
 }
 return {closed,skipped}
}
