import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrAccess } from '@/lib/hr-center/access'
import { readSettings,settingsSchema } from '@/lib/hr-center/policy'
import { jsonData } from '@/lib/hr-center/service'
export async function PUT(req:NextRequest) {
 const a=await hrAccess();if(a.error)return a.error
 if(!a.kinds.includes('PROFILE_CHANGE'))return NextResponse.json({error:'Access denied.'},{status:403})
 const body=await req.json().catch(()=>null),parsed=settingsSchema.safeParse(body?.settings),previous=settingsSchema.safeParse(body?.previous)
 if(!parsed.success||!previous.success)return NextResponse.json({error:'Enter valid privacy settings and a review interval of 30 to 3650 days.'},{status:422})
 const saved=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM companies WHERE id=${a.ctx.companyId} FOR UPDATE`
  const current=await tx.company.findUniqueOrThrow({where:{id:a.ctx.companyId},select:{hrOperationsSettings:true}})
  if(JSON.stringify(readSettings(current.hrOperationsSettings))!==JSON.stringify(previous.data))return false
  await tx.company.update({where:{id:a.ctx.companyId},data:{hrOperationsSettings:jsonData(parsed.data)}})
  await tx.auditLog.create({data:{companyId:a.ctx.companyId,userId:a.ctx.userId,action:'UPDATE',entity:'HRPrivacySettings',entityId:a.ctx.companyId,oldValues:jsonData(readSettings(current.hrOperationsSettings)),newValues:jsonData(parsed.data)}})
  return true
 })
 return saved?NextResponse.json({settings:parsed.data}):NextResponse.json({error:'Settings changed. Refresh and retry.'},{status:409})
}
