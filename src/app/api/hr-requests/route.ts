import { payslipQuestionItems } from '@/lib/hr-requests/payslip-items'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hrRequestAccess, hrRequestAssignees } from '@/lib/hr-requests/access'
import { createRequestSchema, requestStatuses } from '@/lib/hr-requests/policy'
export async function GET(req:NextRequest) {
 const {ctx,error,employeeId,canManage}=await hrRequestAccess();if(error||!ctx)return error!
 const q=req.nextUrl.searchParams, status=q.get('status') || '', search=(q.get('q') || '').trim().slice(0,100)
 if(status&&!requestStatuses.includes(status as typeof requestStatuses[number]))return NextResponse.json({error:'Invalid status.'},{status:422})
 const mine=!canManage||q.get('scope')==='mine', page=Math.max(1,Math.min(10000,Math.floor(Number(q.get('page'))||1)))
 const scope:Prisma.HrRequestWhereInput={companyId:ctx.companyId,...(mine?{employeeId:employeeId??'__none__'}:{})}
 const where:Prisma.HrRequestWhereInput={...scope,...(status?{status}:{}),...(search?{OR:[{subject:{contains:search,mode:'insensitive'}},{employee:{OR:[{firstName:{contains:search,mode:'insensitive'}},{lastName:{contains:search,mode:'insensitive'}},{employeeNo:{contains:search,mode:'insensitive'}}]}}]}:{})}
 const [requests,total,groups,assignees]=await Promise.all([
  prisma.hrRequest.findMany({where,include:{employee:{select:{firstName:true,lastName:true,employeeNo:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*25,take:25}),
  prisma.hrRequest.count({where}),prisma.hrRequest.groupBy({by:['status'],where:scope,_count:true}),canManage?hrRequestAssignees(ctx.companyId):Promise.resolve([]),
 ])
 return NextResponse.json({requests,total,groups,assignees,canManage,canSubmit:!!employeeId,page},{headers:{'Cache-Control':'private, no-store'}})
}
export async function POST(req:NextRequest) {
 const {ctx,error,employeeId}=await hrRequestAccess();if(error||!ctx)return error!
 if(!employeeId)return NextResponse.json({error:'An active employee profile is required to submit a request.'},{status:403})
 const parsed=createRequestSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:422})
 const {requestKey,neededBy,payslipId,payslipItem,payslipAmount,...fields}=parsed.data
 let payrollContext:Prisma.InputJsonValue|undefined
 if(payslipId){
 const slip=await prisma.payslip.findFirst({where:{id:payslipId,employeeId,payrollRun:{companyId:ctx.companyId,status:{in:['APPROVED','LOCKED','DISBURSED']}}},include:{payrollRun:true,incomes:true}})
 if(!slip)return NextResponse.json({error:'Published payslip not found for your employee account.'},{status:404})
 const deductions=await prisma.employeeOtherDeduction.findMany({where:{employeeId,isActive:true},select:{label:true,amount:true}})
 const item=payslipQuestionItems(slip as unknown as Record<string,unknown>,deductions).find(([label,amount])=>label===payslipItem&&typeof payslipAmount==='number'&&Math.abs(amount-payslipAmount)<0.01)
 if(!item)return NextResponse.json({error:'This payslip line changed. Refresh the payslip before asking your question.'},{status:409})
 fields.category='Payroll Clarification'
 payrollContext={payslipId:slip.id,runId:slip.payrollRunId,period:slip.payrollRun.periodLabel,item:item[0],amount:item[1]}
 }
 const assignees=await hrRequestAssignees(ctx.companyId)
 try {
  const request=await prisma.$transaction(async tx=>{
   const request=await tx.hrRequest.create({data:{...fields,...(payrollContext?{payrollContext}:{}),requestKey,companyId:ctx.companyId,employeeId,neededBy:neededBy?new Date(neededBy+'T00:00:00Z'):null}})
   const recipients=assignees.filter(a=>a.id!==ctx.userId)
   if(recipients.length)await tx.notification.createMany({data:recipients.map(a=>({companyId:ctx.companyId,userId:a.id,type:'GENERIC' as const,title:'New HR request',body:fields.subject,link:'/hr-requests?request='+request.id}))})
   return request
  })
  return NextResponse.json({request},{status:201})
 } catch(e) {
  if(!(e instanceof Prisma.PrismaClientKnownRequestError)||e.code!=='P2002')throw e
  const request=await prisma.hrRequest.findFirst({where:{requestKey,companyId:ctx.companyId,employeeId}})
  return request?NextResponse.json({request}):NextResponse.json({error:'Request reference already used.'},{status:409})
 }
}
