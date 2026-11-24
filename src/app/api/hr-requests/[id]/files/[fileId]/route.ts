import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrRequestAccess } from '@/lib/hr-requests/access'
import { hrRequestStorage } from '@/lib/hr-requests/storage'
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string;fileId:string}>}) {
 const {ctx,error,employeeId,canManage}=await hrRequestAccess();if(error||!ctx)return error!
 const {id,fileId}=await params
 const file=await prisma.hrRequestAttachment.findFirst({where:{id:fileId,requestId:id,request:{companyId:ctx.companyId,...(!canManage?{employeeId:employeeId??'__none__'}:{})}}})
 if(!file||!file.storagePath.startsWith(`${ctx.companyId}/${id}/`))return NextResponse.json({error:'File not found.'},{status:404})
 const storage=await hrRequestStorage(),result=await storage.createSignedUrl(file.storagePath,60,{download:file.fileName})
 if(result.error)return NextResponse.json({error:'Could not download the file.'},{status:503})
 return new NextResponse(null,{status:302,headers:{Location:result.data.signedUrl,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
}
