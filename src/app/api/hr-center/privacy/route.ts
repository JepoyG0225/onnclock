import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrAccess,personSelect } from '@/lib/hr-center/access'
import { readSettings } from '@/lib/hr-center/policy'
export async function GET() {
 const a=await hrAccess();if(a.error)return a.error
 if(!a.kinds.includes('PROFILE_CHANGE'))return NextResponse.json({error:'Access denied.'},{status:403})
 const company=await prisma.company.findUniqueOrThrow({where:{id:a.ctx.companyId},select:{hrOperationsSettings:true}})
 const settings=readSettings(company.hrOperationsSettings),cutoff=new Date(Date.now()-settings.retentionReviewDays*86400000)
 const employees=await prisma.employee.findMany({where:{companyId:a.ctx.companyId,isActive:false,updatedAt:{lte:cutoff}},select:{...personSelect,updatedAt:true,resignationDate:true,terminationDate:true},orderBy:{updatedAt:'asc'}})
 return NextResponse.json({employees,settings,cutoff},{headers:{'Cache-Control':'private, no-store'}})
}
