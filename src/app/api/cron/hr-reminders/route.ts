import { prisma } from '@/lib/prisma'
import { activateDueSalaries } from '@/lib/salary/service'
import { NextRequest,NextResponse } from 'next/server'
import { sendHrReminders } from '@/lib/hr-center/reminders'
export const maxDuration=300
export async function GET(req:NextRequest){if(!process.env.CRON_SECRET||req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401});const companies=await prisma.hrOperation.findMany({where:{kind:'SALARY_CHANGE',status:'APPROVED'},distinct:['companyId'],select:{companyId:true}});let activated=0;for(const c of companies)activated+=await prisma.$transaction(tx=>activateDueSalaries(tx,c.companyId),{timeout:30000});return NextResponse.json({activated,sent:await sendHrReminders()})}
