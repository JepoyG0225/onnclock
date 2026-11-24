import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { availableLeave } from '@/lib/leaves/balance'
import { logAudit } from '@/lib/audit'
const rowSchema=z.object({balanceId:z.string().min(1),days:z.number().positive().max(366).multipleOf(.01),dailyRate:z.number().positive().max(1000000).multipleOf(.01),isTaxable:z.boolean(),withholdingTax:z.number().nonnegative().multipleOf(.01)})
const schema=z.object({id:z.string().uuid(),year:z.number().int().min(2000).max(2200),payDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),reason:z.string().trim().min(3).max(1000),reviewed:z.literal(true),entries:z.array(rowSchema).min(1).max(1000)})
export async function POST(req:NextRequest){
 const {ctx,error}=await requireAuth();if(error)return error
 if(!await ctxHasPermission(ctx,'payroll:write'))return NextResponse.json({error:'Payroll write permission is required.'},{status:403})
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:422})
 const input=parsed.data,date=new Date(input.payDate+'T00:00:00Z')
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input.payDate)return NextResponse.json({error:'Select a valid payment date.'},{status:422})
 if(new Set(input.entries.map(e=>e.balanceId)).size!==input.entries.length)return NextResponse.json({error:'Select each leave balance only once.'},{status:422})
 const requestHash=createHash('sha256').update(JSON.stringify({...input,entries:[...input.entries].sort((a,b)=>a.balanceId.localeCompare(b.balanceId))})).digest('hex')
 try{
 const result=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
  const existing=await tx.payrollRun.findUnique({where:{id:input.id},include:{payslips:{select:{calculationBasis:true}}}})
  if(existing){
   if(existing.companyId!==ctx.companyId||existing.runType!=='LEAVE_ENCASHMENT'||!existing.payslips.length||existing.payslips.some(p=>(p.calculationBasis as {requestHash?:string}|null)?.requestHash!==requestHash))throw new Error('This request was changed or cancelled. Refresh and review the batch again.')
   return {runId:existing.id,existing:true}
  }
  const company=await tx.company.findUniqueOrThrow({where:{id:ctx.companyId},select:{payrollCurrency:true}})
  if((company.payrollCurrency||'PHP').toUpperCase()!=='PHP')throw new Error('Leave encashment payroll currently requires PHP payroll currency.')
  const ids=input.entries.map(e=>e.balanceId).sort()
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "leave_balances" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`)
  const balances=await tx.leaveBalance.findMany({where:{id:{in:ids},year:input.year,employee:{companyId:ctx.companyId,isActive:true},leaveType:{companyId:ctx.companyId,isPaidOut:true,isActive:true}},include:{employee:{select:{id:true,isExemptFromTax:true}},leaveType:{select:{name:true}}}})
  if(balances.length!==ids.length)throw new Error('Some selected balances are no longer eligible. Refresh the list.')
  const rows=input.entries.map(e=>{
   const balance=balances.find(b=>b.id===e.balanceId)!
   if(availableLeave(balance)<e.days)throw new Error(`Insufficient available credits for ${balance.leaveType.name}. Refresh and review the selected days.`)
   const amount=new Prisma.Decimal(e.days).mul(e.dailyRate).toDecimalPlaces(2).toNumber()
   if(amount<=0)throw new Error('Each conversion must have a positive rounded amount.')
   if(e.withholdingTax>amount||((!e.isTaxable||balance.employee.isExemptFromTax)&&e.withholdingTax>0))throw new Error('Withholding tax must not exceed the conversion amount and must be zero for exempt income.')
   if(balance.employee.isExemptFromTax&&e.isTaxable)throw new Error('A tax-exempt employee must use non-taxable treatment.')
   return {...e,id:randomUUID(),employeeId:balance.employeeId,label:`${balance.leaveType.name} encashment`,amount}
  })
  const round=(n:number)=>Number(n.toFixed(2)),employeeIds=[...new Set(rows.map(r=>r.employeeId))],gross=round(rows.reduce((n,r)=>n+r.amount,0)),tax=round(rows.reduce((n,r)=>n+r.withholdingTax,0))
  const run=await tx.payrollRun.create({data:{id:input.id,companyId:ctx.companyId,runType:'LEAVE_ENCASHMENT',periodLabel:`Leave Encashment - ${input.payDate}`,payGroupLabel:'Leave Encashment',periodStart:date,periodEnd:date,payDate:date,payFrequency:'MONTHLY',status:'COMPUTED',createdBy:ctx.userId,employeeScopeMode:'CUSTOM',employeeIds,totalBasic:0,totalGross:gross,totalDeductions:tax,totalNetPay:round(gross-tax),notes:input.reason}})
  const types=new Map<boolean,string>()
  for(const taxable of [...new Set(rows.map(r=>r.isTaxable))]){
   const name=taxable?'Leave encashment (taxable)':'Leave encashment (non-taxable)'
   const type=await tx.incomeType.upsert({where:{companyId_name:{companyId:ctx.companyId,name}},update:{},create:{companyId:ctx.companyId,name,code:'LEAVE_CASH',mode:'VARIABLE',isTaxable:taxable}});types.set(taxable,type.id)
  }
  for(const row of rows){await tx.leaveBalance.update({where:{id:row.balanceId},data:{encashed:{increment:row.days}}});await tx.leaveEncashment.create({data:{id:row.id,companyId:ctx.companyId,balanceId:row.balanceId,payrollRunId:run.id,incomeTypeId:types.get(row.isTaxable)!,days:row.days,dailyRate:row.dailyRate,amount:row.amount,isTaxable:row.isTaxable,approvedBy:ctx.userId,reason:input.reason}})}
  const prior=await tx.payslip.groupBy({by:['employeeId'],where:{employeeId:{in:employeeIds},payrollRun:{companyId:ctx.companyId,id:{not:run.id},status:{in:['COMPUTED','FOR_APPROVAL','APPROVED','LOCKED','DISBURSED']},payDate:{gte:new Date(Date.UTC(date.getUTCFullYear(),0,1)),lte:date}}},_sum:{grossPay:true,taxableIncome:true,withholdingTax:true}})
  await tx.payslip.createMany({data:employeeIds.map(employeeId=>{
   const items=rows.filter(r=>r.employeeId===employeeId),amount=round(items.reduce((n,r)=>n+r.amount,0)),tax=round(items.reduce((n,r)=>n+r.withholdingTax,0)),taxable=round(items.filter(r=>r.isTaxable).reduce((n,r)=>n+r.amount,0)),ytd=prior.find(p=>p.employeeId===employeeId)?._sum
   return {employeeId,payrollRunId:run.id,basicSalary:0,dailyRate:0,daysWorked:0,hoursWorked:0,otherEarnings:amount,grossPay:amount,totalDeductions:tax,withholdingTax:tax,netPay:round(amount-tax),taxableIncome:taxable,nonTaxableIncome:round(amount-taxable),ytdGrossPay:Number(ytd?.grossPay??0)+amount,ytdTaxableIncome:Number(ytd?.taxableIncome??0)+taxable,ytdWithholdingTax:Number(ytd?.withholdingTax??0)+tax,manualEdits:{customIncomes:items.map(r=>({label:r.label,amount:r.amount}))},calculationBasis:{kind:'LEAVE_ENCASHMENT',requestHash,reviewedBy:ctx.userId,year:input.year,rows:items,calculatedAt:new Date().toISOString()}}
  })})
  return {runId:run.id,existing:false}
 },{timeout:60000,maxWait:10000})
 if(!result.existing)await logAudit(ctx,'CREATE','PayrollRun',result.runId,{description:`Approved bulk leave encashment: ${input.entries.length} balances`}).catch(()=>{})
 return NextResponse.json(result,{status:result.existing?200:201})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to generate encashment payroll.'},{status:409})}
}
