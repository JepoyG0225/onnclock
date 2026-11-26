import { prisma } from '@/lib/prisma'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { permissions,phToday,terminal,type Kind } from './policy'
export async function authorizedStaff(companyId:string,kind:Kind) {
 const members=await prisma.userCompany.findMany({where:{companyId,isActive:true,user:{isActive:true}},select:{userId:true,role:true}})
 const result:string[]=[]
 // Bound connection usage while including custom roles and company overrides.
 for(let start=0;start<members.length;start+=8){const batch=members.slice(start,start+8);const grants=await Promise.all(batch.map(m=>getEffectivePermissions(m.role,companyId,m.userId)));batch.forEach((m,i)=>{if(grants[i].includes(kind==='SALARY_CHANGE'?'salarychanges:approve':permissions[kind]))result.push(m.userId)})}
 return result
}
export async function sendHrReminders() {
 const today=new Date(phToday()+'T00:00:00Z'),until=new Date(today.getTime()+7*86400000),expiryUntil=new Date(today.getTime()+30*86400000)
 const records=await prisma.hrOperation.findMany({where:{OR:[{kind:'EXPIRY',dueDate:{lte:expiryUntil},status:{notIn:terminal}},{kind:{in:['CONTRACT','COMPLIANCE','SSS_CASE','SAFETY_INCIDENT']},dueDate:{lte:until},OR:[{status:{notIn:terminal}},{kind:'SSS_CASE',status:'APPROVED'}]},{kind:{in:['PROFILE_CHANGE','SALARY_CHANGE']},status:'PENDING'}],AND:[{OR:[{reminderOn:null},{reminderOn:{lt:today}}]}]},orderBy:{createdAt:'asc'},take:500})
 const cache=new Map<string,string[]>();let sent=0
 for(const r of records){
  const key=r.companyId+':'+r.kind
  if(!cache.has(key))cache.set(key,await authorizedStaff(r.companyId,r.kind as Kind))
  const eligible=cache.get(key)!,recipients=r.ownerId&&eligible.includes(r.ownerId)&&(!r.dueDate||r.dueDate.getTime()>=today.getTime()-7*86400000)?[r.ownerId]:eligible.filter(id=>!['PROFILE_CHANGE','SALARY_CHANGE'].includes(r.kind)||id!==r.createdBy)
  if(!recipients.length){await prisma.hrOperation.updateMany({where:{id:r.id,version:r.version},data:{reminderOn:today}});continue}
  sent+=await prisma.$transaction(async tx=>{
   const claim=await tx.hrOperation.updateMany({where:{id:r.id,version:r.version,OR:[{reminderOn:null},{reminderOn:{lt:today}}]},data:{reminderOn:today}})
   if(!claim.count)return 0
   await tx.notification.createMany({data:recipients.map(userId=>({companyId:r.companyId,userId,type:'GENERIC' as const,title:r.kind==='SALARY_CHANGE'?'Salary change awaiting approval':r.kind==='PROFILE_CHANGE'?'Profile change awaiting approval':r.dueDate&&r.dueDate<today?'HR deadline overdue':'HR deadline approaching',body:r.title+(r.dueDate?' - due '+r.dueDate.toISOString().slice(0,10):''),link:'/hr-center?kind='+r.kind+'&record='+r.id}))})
   return recipients.length
  })
 }
 return sent
}
