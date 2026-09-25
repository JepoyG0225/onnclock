import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
const schema=z.object({status:z.enum(['ACTIVE','WAIVED','ENDED']),endDate:z.string().optional()})
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){const {ctx,error}=await requireAuth();if(error)return error;if(!['SUPER_ADMIN','COMPANY_ADMIN','HR_MANAGER'].includes(ctx.role))return NextResponse.json({error:'Not authorized.'},{status:403});const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid status.'},{status:422});const {id}=await params;const row=await prisma.employeeBenefitEnrollment.findFirst({where:{id,plan:{companyId:ctx.companyId}}});if(!row)return NextResponse.json({error:'Enrollment not found.'},{status:404});const enrollment=await prisma.employeeBenefitEnrollment.update({where:{id},data:{status:parsed.data.status,endDate:parsed.data.endDate?new Date(parsed.data.endDate):parsed.data.status==='ENDED'?new Date():null}});return NextResponse.json({enrollment})}
