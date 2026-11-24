import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { authorizedStaff } from './reminders'
import { profileSchema,changesFor } from './profile'
import { readSettings } from './policy'
import { addEvent,jsonData } from './service'
export async function saveProfileChange(companyId:string,employeeId:string,userId:string,body:unknown) {
 const fields=profileSchema.parse(body)
 const result=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM employees WHERE id=${employeeId} AND "companyId"=${companyId} FOR UPDATE`
  const existing=await tx.employee.findFirstOrThrow({where:{id:employeeId,companyId,isActive:true}})
  const company=await tx.company.findUniqueOrThrow({where:{id:companyId},select:{hrOperationsSettings:true}})
  const changes=changesFor(existing as unknown as Record<string,unknown>,fields)
  const pending=readSettings(company.hrOperationsSettings).profileApproval&&Object.keys(changes).length>0
  if(Object.keys(changes).length) {
   if(pending){
    const old=await tx.hrOperation.findMany({where:{companyId,employeeId,kind:'PROFILE_CHANGE',status:'PENDING'},select:{data:true}})
    const overlapping=old.some(r=>Object.keys((r.data as {changes:Record<string,unknown>}).changes).some(key=>key in changes))
    if(overlapping)throw new Error('A request for these fields is already pending. Cancel it in My HR Documents & Data before submitting another change.')
   }
   const record=await tx.hrOperation.create({data:{companyId,employeeId,requestKey:randomUUID(),kind:'PROFILE_CHANGE',title:'Profile update: '+Object.keys(changes).join(', '),status:pending?'PENDING':'APPLIED',data:jsonData({changes}),createdBy:userId}})
   await addEvent(tx,record.id,userId,pending?'SUBMITTED':'APPLIED',{changes})
   if(!pending)await tx.employee.update({where:{id:employeeId},data:{...fields,...(fields.birthDate?{birthDate:new Date(fields.birthDate+'T00:00:00Z')}:{})}})
  }
  const employee=await tx.employee.findUniqueOrThrow({where:{id:employeeId},include:{department:{select:{name:true}},position:{select:{title:true}},workSchedule:{select:{id:true,name:true,requireSelfieOnClockIn:true}}}})
  return {employee,pending}
 })
 if(result.pending){
  try{const staff=(await authorizedStaff(companyId,'PROFILE_CHANGE')).filter(id=>id!==userId);if(staff.length)await prisma.notification.createMany({data:staff.map(id=>({companyId,userId:id,type:'GENERIC' as const,title:'Profile change awaiting approval',body:'An employee submitted profile changes for review.',link:'/hr-center?kind=PROFILE_CHANGE'}))})}catch(e){console.error('[hr-center] Profile review notification unavailable',e instanceof Error?e.message:'Unknown error')}
 }
 return result
}
