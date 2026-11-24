import { randomUUID } from 'node:crypto'
import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrAccess } from '@/lib/hr-center/access'
import { type Kind } from '@/lib/hr-center/policy'
import { hrRequestStorage,fileMime,FILE_LIMIT } from '@/lib/hr-requests/storage'
import { addEvent } from '@/lib/hr-center/service'
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const a=await hrAccess();if(a.error)return a.error
 const {id}=await params,r=await prisma.hrOperation.findFirst({where:{id,companyId:a.ctx.companyId}})
 if(!r||!a.kinds.includes(r.kind as Kind))return NextResponse.json({error:'Record not found.'},{status:404})
 if(!['CONTRACT','COMPLIANCE','SSS_CASE','SAFETY_INCIDENT','SALARY_CHANGE'].includes(r.kind))return NextResponse.json({error:'Attachments are supported for contract, compliance and SSS records.'},{status:422})
 if(Number(req.headers.get('content-length')??0)>FILE_LIMIT+100000)return NextResponse.json({error:'Choose a file up to 4 MB.'},{status:413})
 const form=await req.formData().catch(()=>null),file=form?.get('file')
 if(!(file instanceof File)||!file.size||file.size>FILE_LIMIT)return NextResponse.json({error:'Choose a PDF or image up to 4 MB.'},{status:422})
 const bytes=Buffer.from(await file.arrayBuffer()),mime=fileMime(bytes)
 if(!mime)return NextResponse.json({error:'Choose a PDF, JPG, PNG or WEBP file.'},{status:422})
 const storage=await hrRequestStorage(),path=`${a.ctx.companyId}/operations/${id}/${randomUUID()}.${mime==='application/pdf'?'pdf':mime.split('/')[1]}`
 const uploaded=await storage.upload(path,bytes,{contentType:mime,upsert:false})
 if(uploaded.error)return NextResponse.json({error:'Upload failed. Retry.'},{status:503})
 try {
  const saved=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM hr_operations WHERE id=${id} AND "companyId"=${a.ctx.companyId} FOR UPDATE`
   if(await tx.hrOperationFile.count({where:{operationId:id}})>=20)return false
   await tx.hrOperationFile.create({data:{operationId:id,fileName:file.name.slice(0,200),storagePath:path,mime,size:file.size}})
   await addEvent(tx,id,a.ctx.userId,'FILE_ADDED',{fileName:file.name.slice(0,200)})
   return true
  })
  if(!saved){await storage.remove([path]);return NextResponse.json({error:'Maximum 20 attachments per record.'},{status:409})}
 }catch(e){await storage.remove([path]);throw e}
 return NextResponse.json({success:true},{status:201})
}
