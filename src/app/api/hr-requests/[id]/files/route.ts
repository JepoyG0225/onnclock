import { randomUUID } from 'node:crypto'
import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrRequestAccess } from '@/lib/hr-requests/access'
import { hrRequestStorage,fileMime,FILE_LIMIT } from '@/lib/hr-requests/storage'
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const {ctx,error,employeeId,canManage}=await hrRequestAccess();if(error||!ctx)return error!
 const {id}=await params
 const request=await prisma.hrRequest.findFirst({where:{id,companyId:ctx.companyId,...(!canManage?{employeeId:employeeId??'__none__'}:{})},include:{employee:{select:{userId:true}}}})
 if(!request)return NextResponse.json({error:'Request not found.'},{status:404})
 if(['CLOSED','CANCELLED'].includes(request.status))return NextResponse.json({error:'This request is closed.'},{status:409})
 if(Number(req.headers.get('content-length')??0)>FILE_LIMIT+100000)return NextResponse.json({error:'Choose a file up to 4 MB.'},{status:413})
 const form=await req.formData().catch(()=>null),file=form?.get('file'),deliverable=form?.get('deliverable')==='true'
 if(deliverable&&!canManage)return NextResponse.json({error:'Only HR can deliver documents.'},{status:403})
 if(!(file instanceof File)||!file.size||file.size>FILE_LIMIT)return NextResponse.json({error:'Choose a PDF or image up to 4 MB.'},{status:422})
 const bytes=Buffer.from(await file.arrayBuffer()),mime=fileMime(bytes)
 if(!mime)return NextResponse.json({error:'Choose a PDF, JPG, PNG or WEBP file.'},{status:422})
 const path=`${ctx.companyId}/${id}/${randomUUID()}.${mime==='application/pdf'?'pdf':mime.split('/')[1]}`
 const storage=await hrRequestStorage(),uploaded=await storage.upload(path,bytes,{contentType:mime,upsert:false})
 if(uploaded.error)return NextResponse.json({error:'File upload failed. Please retry.'},{status:503})
 try {
  const saved=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM hr_requests WHERE id = ${id} AND "companyId" = ${ctx.companyId} FOR UPDATE`
   const current=await tx.hrRequest.findUnique({where:{id}})
   if(!current||['CLOSED','CANCELLED'].includes(current.status)||await tx.hrRequestAttachment.count({where:{requestId:id}})>=20)return false
   await tx.hrRequestAttachment.create({data:{requestId:id,uploadedBy:ctx.userId,fileName:file.name.slice(0,200),storagePath:path,mime,size:file.size,isDeliverable:deliverable}})
   await tx.hrRequest.update({where:{id},data:{updatedAt:new Date()}})
   await tx.hrRequestMessage.create({data:{requestId:id,authorId:ctx.userId,authorName:ctx.email,body:`${deliverable?'Document delivered':'Attachment added'}: ${file.name.slice(0,200)}`}})
   if(deliverable&&request.employee.userId&&request.employee.userId!==ctx.userId)await tx.notification.create({data:{companyId:ctx.companyId,userId:request.employee.userId,type:'GENERIC',title:'Your HR document is ready',body:request.subject,link:'/portal/hr-requests?request='+id}})
   return true
  })
  if(!saved){await storage.remove([path]);return NextResponse.json({error:'Request closed or attachment limit reached (20 files). Refresh and try again.'},{status:409})}
 }catch(e){await storage.remove([path]);throw e}
 return NextResponse.json({success:true},{status:201})
}
