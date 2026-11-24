import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrAccess,personSelect } from '@/lib/hr-center/access'
import { phToday,payloadSchemas,wageResult } from '@/lib/hr-center/policy'
import { dateOnly } from '@/lib/expenses/policy'
export async function GET(req:NextRequest) {
 const a=await hrAccess();if(a.error)return a.error
 if(!a.kinds.includes('WAGE_ORDER'))return NextResponse.json({error:'Access denied.'},{status:403})
 const parsed=dateOnly.safeParse(req.nextUrl.searchParams.get('date')??phToday());if(!parsed.success)return NextResponse.json({error:'Invalid check date.'},{status:422})
 const [orders,employees]=await Promise.all([prisma.hrOperation.findMany({where:{companyId:a.ctx.companyId,kind:'WAGE_ORDER',status:'ACTIVE'}}),prisma.employee.findMany({where:{companyId:a.ctx.companyId,isActive:true},select:{...personSelect,rateType:true,basicSalary:true,dailyRate:true,hourlyRate:true}})])
 const rules=orders.flatMap(o=>{const p=payloadSchemas.WAGE_ORDER.safeParse(o.data);return p.success&&p.data.effectiveDate<=parsed.data?[{...p.data,id:o.id,title:o.title}]:[]})
 const rows=employees.map(employee=>{
  const assigned=rules.filter(r=>r.employeeIds.includes(employee.id))
  const groups=new Map<string,typeof assigned[number]>()
  let ambiguous=false
  for(const r of assigned){const key=r.region+'|'+r.sector,old=groups.get(key);if(old?.effectiveDate===r.effectiveDate)ambiguous=true;if(!old||r.effectiveDate>old.effectiveDate)groups.set(key,r)}
  if(groups.size!==1||ambiguous)return {employee,status:groups.size?'REVIEW_MULTIPLE_ORDERS':'NO_APPLICABLE_ORDER',daily:null,gap:null,rule:null}
  const rule=[...groups.values()][0]
  return {employee,...wageResult(employee,rule),rule}
 })
 return NextResponse.json({date:parsed.data,rows},{headers:{'Cache-Control':'private, no-store'}})
}
