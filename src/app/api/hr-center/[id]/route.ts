import { logAudit } from '@/lib/audit'
import { decideSalary } from '@/lib/salary/service'
import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrAccess,personSelect,fileSelect,ownVisible } from '@/lib/hr-center/access'
import { editSchema,actionSchema,type Kind } from '@/lib/hr-center/policy'
import { prepareData,jsonData,addEvent,notifyEmployee,HrError } from '@/lib/hr-center/service'
import { approvedProfileData } from '@/lib/hr-center/profile'
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const a=await hrAccess();if(a.error)return a.error
 const {id}=await params
 const r=await prisma.hrOperation.findFirst({where:{id,companyId:a.ctx.companyId},include:{employee:{select:personSelect},events:{orderBy:{createdAt:'asc'}},files:{select:fileSelect}}})
 if(!r||(!a.kinds.includes(r.kind as Kind)&&!(r.employeeId===a.employeeId&&ownVisible(r.kind,r.status))))return NextResponse.json({error:'Record not found.'},{status:404})
 return NextResponse.json({record:r},{headers:{'Cache-Control':'private, no-store'}})
}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const a=await hrAccess();if(a.error)return a.error
 const {id}=await params,body=await req.json().catch(()=>null)
 const parsed=body?.action?actionSchema.safeParse(body):editSchema.safeParse(body)
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:422})
 const change=parsed.data
 try {
  const initial=await prisma.hrOperation.findFirst({where:{id,companyId:a.ctx.companyId}})
  if(!initial)throw new HrError('Record not found.',404)
  const manager=a.kinds.includes(initial.kind as Kind),owner=initial.employeeId===a.employeeId&&!!a.employeeId
  const ownAction='action'in change&&((initial.kind==='DOCUMENT'&&change.action==='ACKNOWLEDGE')||(initial.kind==='PROFILE_CHANGE'&&change.action==='CANCEL'))
  if(!manager&&!(owner&&ownAction))throw new HrError('Access denied.',403)
  let payload:Record<string,unknown>|null=null
  if(!('action'in change)) {
   if(['DOCUMENT','PROFILE_CHANGE','SALARY_CHANGE'].includes(initial.kind))throw new HrError('Issued documents and submitted profile changes cannot be edited.')
   if(['REGULARIZED','RENEWED','ENDED'].includes(initial.status))throw new HrError('This contract decision is final. Create a new review record.')
   if(initial.kind==='CONTRACT'&&initial.employeeId!==change.employeeId)throw new HrError('Create a new contract review to change the employee.')
   payload=(await prepareData(a.ctx.companyId,initial.kind as Exclude<Kind,'PROFILE_CHANGE'>,change.data,change.employeeId,change.ownerId,change.status,change.dueDate)).payload
  }
  const record=await prisma.$transaction(async tx=>{
   if(initial.kind==='SALARY_CHANGE')await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${a.ctx.companyId}))`
   await tx.$queryRaw`SELECT id FROM hr_operations WHERE id=${id} AND "companyId"=${a.ctx.companyId} FOR UPDATE`
   const r=await tx.hrOperation.findUniqueOrThrow({where:{id}})
   if(r.version!==change.version)throw new HrError('This record changed. Refresh before saving.',409)
   let status=r.status
   if('action'in change) {
    if(r.kind==='SALARY_CHANGE'){
     const decision=await decideSalary(tx,r,a.ctx.userId,change.action,change.note,a.granted.includes('salarychanges:approve'))
     const updated=await tx.hrOperation.update({where:{id},data:{...decision,version:{increment:1}}})
     await addEvent(tx,id,a.ctx.userId,change.action,{status:decision.status,note:change.note})
     return updated
    }

    if(change.action==='ACKNOWLEDGE') {
     if(r.kind!=='DOCUMENT'||!owner||r.status!=='ISSUED')throw new HrError('Only the recipient can acknowledge an issued document.',403)
     status='ACKNOWLEDGED'
    }else if(change.action==='VOID') {
     if(r.kind!=='DOCUMENT'||!manager||r.status==='VOID'||!change.note)throw new HrError('Enter a reason to void this issued document.')
     status='VOID'
    }else {
     if(r.kind!=='PROFILE_CHANGE'||r.status!=='PENDING')throw new HrError('This profile request is no longer pending.',409)
     if(change.action==='CANCEL'){if(!owner)throw new HrError('Only the requester can cancel.',403);status='CANCELLED'}
     else {
      if(!manager||owner)throw new HrError('A different authorized reviewer must review this request.',403)
      if(!change.note)throw new HrError('Enter the review decision note.')
      status=change.action==='APPROVE'?'APPROVED':'REJECTED'
      if(status==='APPROVED') {
       await tx.$queryRaw`SELECT id FROM employees WHERE id=${r.employeeId} AND "companyId"=${a.ctx.companyId} FOR UPDATE`
       const employee=await tx.employee.findFirst({where:{id:r.employeeId!,companyId:a.ctx.companyId,isActive:true}})
       if(!employee)throw new HrError('Employee is no longer active.',409)
       const changes=(r.data as {changes:Record<string,{before:unknown;after:unknown}>}).changes
       let data;try{data=approvedProfileData(employee as unknown as Record<string,unknown>,changes)}catch(e){throw new HrError(e instanceof Error?e.message:'Invalid profile changes.',409)}
       await tx.employee.update({where:{id:employee.id},data})
      }
     }
    }
    const updated=await tx.hrOperation.update({where:{id},data:{status,version:{increment:1},...(status==='ACKNOWLEDGED'?{acknowledgedAt:new Date()}:{})}})
    await addEvent(tx,id,a.ctx.userId,change.action,{status,note:change.note})
    if(change.action!=='ACKNOWLEDGE')await notifyEmployee(tx,r.employeeId,a.ctx.companyId,'HR record updated',`${r.title}: ${status}`)
    return updated
   }
   if(r.kind==='CONTRACT'&&change.status==='REGULARIZED') {
    const result=await tx.employee.updateMany({where:{id:r.employeeId!,companyId:a.ctx.companyId,isActive:true,employmentStatus:'PROBATIONARY'},data:{employmentStatus:'REGULAR',regularizationDate:new Date(String(payload!.effectiveDate)+'T00:00:00Z')}})
    if(result.count!==1)throw new HrError('Employee status changed. Refresh the contract review.',409)
   }
   const updated=await tx.hrOperation.update({where:{id},data:{title:change.title,employeeId:change.employeeId,ownerId:change.ownerId,dueDate:change.dueDate?new Date(change.dueDate+'T00:00:00Z'):null,status:change.status,data:jsonData(payload),version:{increment:1},reminderOn:null}})
   await addEvent(tx,id,a.ctx.userId,'UPDATED',{before:{title:r.title,status:r.status,data:r.data,ownerId:r.ownerId,dueDate:r.dueDate},after:{title:updated.title,status:updated.status,data:updated.data,ownerId:updated.ownerId,dueDate:updated.dueDate}})
   return updated
  })
  return NextResponse.json({record})
 }catch(e){if(e instanceof HrError)return NextResponse.json({error:e.message},{status:e.status});throw e}
}

export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const a=await hrAccess();if(a.error)return a.error
 if(!a.granted.includes('documents:manage'))return NextResponse.json({error:'Document management permission is required.'},{status:403})
 const {id}=await params,body=await req.json().catch(()=>null)
 if(!Number.isInteger(body?.version)||body.version<1)return NextResponse.json({error:'Refresh the template before deleting.'},{status:422})
 try {
  const removed=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM hr_operations WHERE id=${id} AND "companyId"=${a.ctx.companyId} FOR UPDATE`
   const record=await tx.hrOperation.findFirst({where:{id,companyId:a.ctx.companyId,kind:'TEMPLATE'}})
   if(!record)throw new HrError('Template not found.',404)
   if(record.version!==body.version)throw new HrError('This template changed. Refresh before deleting.',409)
   await tx.hrOperation.delete({where:{id:record.id}})
   return record
  })
  await logAudit(a.ctx,'DELETE','HrOperation',id,{description:`Deleted document template: ${removed.title}`,oldValues:{title:removed.title,version:removed.version}}).catch(()=>{})
  return NextResponse.json({ok:true})
 }catch(e){if(e instanceof HrError)return NextResponse.json({error:e.message},{status:e.status});throw e}
}
