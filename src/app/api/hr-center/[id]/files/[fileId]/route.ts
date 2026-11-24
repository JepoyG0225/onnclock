import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrAccess } from '@/lib/hr-center/access'
import { hrRequestStorage } from '@/lib/hr-requests/storage'
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string;fileId:string}>}) {
 const a=await hrAccess();if(a.error)return a.error
 const {id,fileId}=await params,file=await prisma.hrOperationFile.findFirst({where:{id:fileId,operationId:id,operation:{companyId:a.ctx.companyId,kind:{in:a.kinds}}}})
 if(!file||!file.storagePath.startsWith(`${a.ctx.companyId}/operations/${id}/`))return NextResponse.json({error:'File not found.'},{status:404})
 const storage=await hrRequestStorage(),result=await storage.createSignedUrl(file.storagePath,60,{download:file.fileName})
 if(result.error)return NextResponse.json({error:'Download unavailable. Retry.'},{status:503})
 return new NextResponse(null,{status:302,headers:{Location:result.data.signedUrl,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
}
