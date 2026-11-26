import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { payrollReadiness } from '@/lib/payroll/readiness'
export async function GET(_req:Request,{params}:{params:Promise<{runId:string}>}){
 const {ctx,error}=await requireAuth();if(error)return error
 if(!await ctxHasPermission(ctx,'payroll:read'))return NextResponse.json({error:'Access denied'},{status:403})
 const {runId}=await params;const run=await prisma.payrollRun.findFirst({where:{id:runId,companyId:ctx.companyId}})
 if(!run)return NextResponse.json({error:'Payroll not found'},{status:404})
 return NextResponse.json(await payrollReadiness(run),{headers:{'Cache-Control':'no-store'}})
}
