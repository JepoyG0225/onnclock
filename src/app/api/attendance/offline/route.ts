import { leaveClockInError, workedHalfPeriod, halfDayWorkedShift } from '@/lib/attendance/half-day-leave'
import { syncAutoOvertimeRequest } from '@/lib/overtime-requests'
import { NextRequest, NextResponse } from 'next/server'
import { createNotificationsForUsers } from '@/lib/notifications'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { issueOfflinePermit, verifyOfflinePermit } from '@/lib/attendance/offline-token'
import { normalizeActivityPhoto } from '@/lib/attendance/activities'
import { resolveAttendanceLocation } from '@/lib/attendance/schedule-location'
import { locationError } from '@/lib/attendance/location-policy'
import { computeHours, computeLateAndUndertime, resolveShiftForDtr } from '@/lib/timesheet/compute'

const locationSchema=z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),accuracy:z.number().nonnegative()}).optional()
const schema=z.object({token:z.string().max(3000),id:z.string().uuid(),shiftId:z.string().min(1).max(100),kind:z.enum(['IN','OUT','LOG']),at:z.string().datetime(),description:z.string().trim().max(2000).optional(),notes:z.string().trim().max(2000).optional(),photos:z.array(z.string().max(2_000_000)).max(5).default([]),location:locationSchema})
export async function GET(){
 const {ctx,error}=await requireAuth();if(error)return error
 const employee=await prisma.employee.findFirst({where:{companyId:ctx.companyId,userId:ctx.userId,isActive:true},include:{company:true,workSchedule:true}})
 if(!employee)return NextResponse.json({error:'An active employee account is required.'},{status:403})
 if(employee.company.screenCaptureEnabled)return NextResponse.json({error:'Offline browser attendance is unavailable while screen monitoring is required.'},{status:403})
 const active=await prisma.dTRRecord.findFirst({where:{employeeId:employee.id,timeIn:{not:null},timeOut:null},select:{id:true,timeIn:true},orderBy:{timeIn:'desc'}})
 return NextResponse.json({...issueOfflinePermit(employee.id,ctx.companyId,active?.id??null),employeeId:employee.id,companyId:ctx.companyId,name:employee.firstName+' '+employee.lastName,selfieRequired:(employee.company.selfieRequired||employee.workSchedule?.requireSelfieOnClockIn===true)&&!employee.selfieExempt,active},{headers:{'Cache-Control':'private, no-store'}})
}
export async function POST(req:NextRequest){
 const {ctx,error}=await requireAuth();if(error)return error
 try{
  if(Number(req.headers.get('content-length')??0)>4_000_000)throw new Error('Upload fewer photos per activity.')
  const event=schema.parse(await req.json()),permit=verifyOfflinePermit(event.token,true),at=new Date(event.at)
  const employee=await prisma.employee.findFirst({where:{id:permit.employeeId,companyId:ctx.companyId,userId:ctx.userId,isActive:true},include:{workSchedule:true,company:true}})
  if(!employee||permit.companyId!==ctx.companyId)return NextResponse.json({error:'Sign in with the employee account that recorded these entries.'},{status:403})
  if(employee.company.screenCaptureEnabled)throw new Error('Screen monitoring is required. Ask HR to review these offline records.')
  if(at.getTime()<permit.issuedAt-60000||at.getTime()>Date.now()+300000||at.getTime()>permit.expiresAt)throw new Error('Recorded time is outside the offline access period. Ask HR to review it.')
  if(event.photos.reduce((n,p)=>n+p.length,0)>3_500_000)throw new Error('Combined photos are too large.')
  const hash=createHash('sha256').update(JSON.stringify({...event,token:undefined})).digest('hex')
  const photos=await Promise.all(event.photos.map(normalizeActivityPhoto))
  if(event.kind==='LOG'&&(!event.description||!photos.length))throw new Error('An activity description and camera photo are required.')
  if(event.kind!=='LOG'&&(employee.company.selfieRequired||employee.workSchedule?.requireSelfieOnClockIn===true)&&!employee.selfieExempt&&!photos.length)throw new Error('A clocking selfie is required.')
  const location=await resolveAttendanceLocation(ctx.companyId,employee.id,at)
  if(event.kind!=='LOG'){const failure=locationError(location.policy,event.location?.lat,event.location?.lng);if(failure)throw new Error(failure)}
  const assignments=await prisma.employeeShiftAssignment.findMany({where:{companyId:ctx.companyId,employeeId:employee.id,date:location.date},select:{isRestDay:true}})
  const workDays=Array.isArray(employee.workSchedule?.workDays)?employee.workSchedule.workDays:[]
  const rest=assignments.length?assignments.every(a=>a.isRestDay):!!employee.workScheduleId&&!workDays.includes(location.date.getUTCDay())
  if(event.kind==='IN'&&!employee.workScheduleId&&!assignments.length)throw new Error('No schedule exists for this offline clock-in. Ask HR to assign a schedule.')
  const isNew = await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "id" FROM "employees" WHERE "id"=${employee.id} FOR UPDATE`
   const duplicate=await tx.offlineAttendanceEvent.findUnique({where:{id:event.id}})
   if(duplicate){if(duplicate.companyId!==ctx.companyId||duplicate.employeeId!==employee.id||duplicate.payloadHash!==hash)throw new Error('Offline reference conflict.');return false}
   const record=await tx.dTRRecord.findFirst({where:{id:event.shiftId,employeeId:employee.id}})
   if(event.kind==='IN'){
    if(record)throw new Error('This shift already exists. Refresh attendance before continuing.')
    const overlap=await tx.dTRRecord.findFirst({where:{employeeId:employee.id,timeIn:{not:null},OR:[{timeOut:null},{timeIn:{lte:at},timeOut:{gte:at}},{timeIn:{gt:at}}]}})
    if(overlap)throw new Error('This offline shift conflicts with existing attendance. Ask HR to reconcile it.')
    const onLeave=await tx.leaveRequest.findMany({where:{employeeId:employee.id,status:'APPROVED',startDate:{lte:location.date},endDate:{gte:location.date}}})
    const leaveError=leaveClockInError(onLeave,at,location.date,{...location.schedule,timeIn:location.shiftTimeIn,timeOut:location.shiftTimeOut});if(leaveError)throw new Error(leaveError)
    const halfDayPeriod=workedHalfPeriod(onLeave)
    const holiday=await tx.holiday.findFirst({where:{companyId:ctx.companyId,date:location.date}})
    await tx.dTRRecord.create({data:{id:event.shiftId,employeeId:employee.id,date:location.date,timeIn:at,isHalfDay:!!halfDayPeriod,halfDayPeriod,source:'OFFLINE',attendanceLocation:location.policy,isRestDay:rest,restDayApproval:rest?'PENDING':null,isHoliday:!!holiday,holidayType:holiday?.type,clockInPhoto:photos[0]??null,clockInLat:event.location?.lat,clockInLng:event.location?.lng,clockInAccuracy:event.location?.accuracy}})
   }else{
    if(!record?.timeIn||(record.source!=='OFFLINE'&&permit.activeId!==record.id))throw new Error('The offline shift is not linked to this device access. Ask HR to review it.')
    if(at<record.timeIn||at.getTime()-record.timeIn.getTime()>86400000)throw new Error('Event time is outside the shift.')
    if(event.kind==='OUT'){
     if(record.timeOut)throw new Error('This shift was already clocked out. Ask HR to review it.')
     const resolved=halfDayWorkedShift(await resolveShiftForDtr({employeeId:employee.id,date:record.date,actualTimeIn:record.timeIn,employee}),record)
     const hours=computeHours(record.timeIn,at,record.breakIn,record.breakOut,{plannedRegularMinutes:resolved.plannedRegularMinutes,allowedBreakMinutes:resolved.allowedBreakMinutes,scheduledStart: resolved.scheduledStart, scheduledEnd: resolved.scheduledEnd, scheduledTimeIn:resolved.scheduleTimeIn,scheduledTimeOut:resolved.scheduleTimeOut})
     const deductions=record.isRestDay?{lateMinutes:0,undertimeMinutes:0}:computeLateAndUndertime(record.timeIn,at,resolved.scheduleTimeIn,resolved.scheduleTimeOut, resolved)
     await tx.dTRRecord.update({where:{id:record.id},data:{timeOut:at,regularHours:hours.regularHours,overtimeHours:hours.overtimeHours,nightDiffHours:hours.nightDiffHours,...deductions,approvedBy:null,clockOutPhoto:photos[0]??null,clockOutLat:event.location?.lat,clockOutLng:event.location?.lng,clockOutAccuracy:event.location?.accuracy}})
    }else{
     if(record.timeOut&&at>record.timeOut)throw new Error('Activity occurred after clock-out.')
     await tx.attendanceActivity.create({data:{id:event.id,dtrRecordId:record.id,description:event.description!,notes:event.notes,loggedAt:at,photo:photos[0],photos,photoCount:photos.length,latitude:event.location?.lat,longitude:event.location?.lng,locationAccuracy:event.location?.accuracy,locationCapturedAt:event.location?at:null}})
    }
   }
   await tx.offlineAttendanceEvent.create({data:{id:event.id,companyId:ctx.companyId,employeeId:employee.id,payloadHash:hash}})
   return true
  },{timeout:20000})
  if(isNew&&event.kind==='IN'&&rest){const reviewers=await prisma.userCompany.findMany({where:{companyId:ctx.companyId,isActive:true,role:{in:['COMPANY_ADMIN','HR_MANAGER']}},select:{userId:true}});await createNotificationsForUsers(reviewers.map(r=>r.userId),{companyId:ctx.companyId,type:'GENERIC',title:'Offline rest-day shift needs approval',body:employee.firstName+' '+employee.lastName,link:'/attendance?restDayRequest='+event.shiftId})}
  if(event.kind==='OUT'){const saved=await prisma.dTRRecord.findUnique({where:{id:event.shiftId},select:{date:true,timeIn:true,timeOut:true,overtimeHours:true,isRestDay:true}});if(saved&&!saved.isRestDay)await syncAutoOvertimeRequest({companyId:ctx.companyId,employeeId:employee.id,date:saved.date,timeIn:saved.timeIn,timeOut:saved.timeOut,overtimeHours:Number(saved.overtimeHours??0)})}
  return NextResponse.json({success:true,id:event.id})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to sync. Your offline records must be retained.'},{status:409})}
}
