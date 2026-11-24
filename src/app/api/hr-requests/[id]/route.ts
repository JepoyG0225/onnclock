import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrRequestAccess,hrRequestAssignees,attachmentSelect } from '@/lib/hr-requests/access'
import { requestActionError,updateRequestSchema } from '@/lib/hr-requests/policy'
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const {ctx,error,employeeId,canManage}=await hrRequestAccess();if(error||!ctx)return error!
 const {id}=await params
 const request=await prisma.hrRequest.findFirst({where:{id,companyId:ctx.companyId,...(!canManage?{employeeId:employeeId??'__none__'}:{})},include:{employee:{select:{firstName:true,lastName:true,employeeNo:true}},messages:{where:canManage?{}:{internal:false},orderBy:[{createdAt:'asc'},{id:'asc'}]},attachments:{select:attachmentSelect,orderBy:{createdAt:'asc'}}}})
 if(!request)return NextResponse.json({error:'Request not found.'},{status:404})
 return NextResponse.json({request:{...request,isOwner:request.employeeId===employeeId},canManage},{headers:{'Cache-Control':'private, no-store'}})
}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const {ctx,error,employeeId,canManage}=await hrRequestAccess();if(error||!ctx)return error!
 const {id}=await params,parsed=updateRequestSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:422})
 const a=parsed.data
 if(a.action==='MANAGE') {
  if(!canManage)return NextResponse.json({error:'Access denied.'},{status:403})
  if(['RESOLVED','CLOSED'].includes(a.status)&&!a.resolution?.trim())return NextResponse.json({error:'Enter a resolution before completing the request.'},{status:422})
  if(a.assigneeId&&!(await hrRequestAssignees(ctx.companyId)).some(u=>u.id===a.assigneeId))return NextResponse.json({error:'Select an authorized HR assignee from this company.'},{status:422})
 }
 const reviewers=a.action!=='MANAGE'?await hrRequestAssignees(ctx.companyId):[]
 const result=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM hr_requests WHERE id = ${id} AND "companyId" = ${ctx.companyId} FOR UPDATE`
  const current=await tx.hrRequest.findFirst({where:{id,companyId:ctx.companyId},include:{employee:{select:{userId:true}}}})
  if(!current||(!canManage&&current.employeeId!==employeeId))return {error:'Request not found.',status:404}
  const violation=requestActionError(a.action,current.status,current.employeeId===employeeId,canManage,a.action==='MESSAGE'&&a.internal)
  if(violation)return {error:violation,status:403}
  if('updatedAt' in a&&a.updatedAt!==current.updatedAt.toISOString())return {error:'This request changed. Refresh and try again.',status:409}
  let message:string,internal=false
  if(a.action==='MESSAGE') {message=a.body;internal=a.internal;await tx.hrRequest.update({where:{id},data:{updatedAt:new Date()}})}
  else if(a.action==='MANAGE') {
   await tx.hrRequest.update({where:{id},data:{status:a.status,priority:a.priority,assigneeId:a.assigneeId,neededBy:a.neededBy?new Date(a.neededBy+'T00:00:00Z'):null,resolution:a.resolution}})
   message=`HR updated request: ${a.status.replaceAll('_',' ')}.${a.resolution?' '+a.resolution:''}`
  } else {
   const status=a.action==='CANCEL'?'CANCELLED':'OPEN';await tx.hrRequest.update({where:{id},data:{status,resolution:null}});message=`Request ${a.action==='CANCEL'?'cancelled':'reopened'} by employee.`
  }
  await tx.hrRequestMessage.create({data:{requestId:id,authorId:ctx.userId,authorName:ctx.email,body:message,internal}})
  const assignee=a.action==='MANAGE'?a.assigneeId:current.assigneeId
  const recipients=[...new Set([...(assignee?[assignee]:reviewers.map(r=>r.id)),...(!internal?[current.employee.userId]:[])].filter((v):v is string=>!!v&&v!==ctx.userId))]
  if(recipients.length)await tx.notification.createMany({data:recipients.map(userId=>({companyId:ctx.companyId,userId,type:'GENERIC' as const,title:'HR request updated',body:current.subject,link:(userId===current.employee.userId?'/portal/hr-requests':'/hr-requests')+'?request='+id}))})
  return {status:200}
 })
 return NextResponse.json('error' in result?{error:result.error}:{success:true},{status:result.status})
}
