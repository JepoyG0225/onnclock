import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { POST as calculate } from '../route'
import { finalPayPayslip } from '@/lib/payroll/final-pay-transfer'
import { logAudit } from '@/lib/audit'
const schema=z.object({requestId:z.string().uuid(),reviewed:z.literal(true),reviewHash:z.string().length(64),runId:z.string().min(1).optional(),payDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),input:z.object({employeeId:z.string().min(1),lastWorkingDay:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).passthrough()})
export async function GET(req:NextRequest){
 const {ctx,error}=await requireAuth();if(error)return error
 if(!await ctxHasPermission(ctx,'payroll:write'))return NextResponse.json({error:'Payroll write permission is required.'},{status:403})
 const employeeId=req.nextUrl.searchParams.get('employeeId');if(!employeeId)return NextResponse.json({runs:[]})
 const employee=await prisma.employee.findFirst({where:{id:employeeId,companyId:ctx.companyId},select:{id:true}});if(!employee)return NextResponse.json({error:'Employee not found'},{status:404})
 const runs=await prisma.payrollRun.findMany({where:{companyId:ctx.companyId,status:'COMPUTED',runType:{in:['REGULAR','FINAL_PAY']},computationStartedAt:null,payslips:{none:{employeeId}}},select:{id:true,periodLabel:true,payDate:true,runType:true},orderBy:{payDate:'desc'},take:100})
 return NextResponse.json({runs})
}
export async function POST(req:NextRequest){
 const {ctx,error}=await requireAuth();if(error)return error
 if(!await ctxHasPermission(ctx,'payroll:write'))return NextResponse.json({error:'Payroll write permission is required.'},{status:403})
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Review the computed final pay and select a valid payroll destination.'},{status:422})
 const input=parsed.data,date=new Date(input.payDate+'T00:00:00Z')
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input.payDate||input.payDate<input.input.lastWorkingDay)return NextResponse.json({error:'Payment date must be valid and on or after the last working day.'},{status:422})
 try{
 const output=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
  const existing=await tx.payslip.findFirst({where:{employeeId:input.input.employeeId,payrollRun:{companyId:ctx.companyId},calculationBasis:{path:['kind'],equals:'FINAL_PAY'}},select:{payrollRunId:true,calculationBasis:true}})
  if(existing){const basis=existing.calculationBasis as {requestId?:string;reviewHash?:string};if(basis.requestId===input.requestId&&basis.reviewHash===input.reviewHash)return{runId:existing.payrollRunId,existing:true};throw Error('This employee already has final pay in a payroll run. Open that run, or remove its unapproved final-pay payslip before generating a replacement.')}
  const company=await tx.company.findUniqueOrThrow({where:{id:ctx.companyId},select:{payrollCurrency:true}});if((company.payrollCurrency||'PHP')!=='PHP')throw Error('Final pay payroll currently requires PHP currency.')
  const response=await calculate(new NextRequest(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(input.input)}));const computed=await response.json();if(!response.ok)throw Error(computed.error||'Unable to recompute final pay.')
  if(computed.reviewHash!==input.reviewHash)throw Error('Final pay source values changed. Recompute and review the updated statement before generating payroll.')
  const slip=finalPayPayslip(computed.result,computed.snapshot,Number(input.input.unreturnedAssetsCost??0))
  let run
  if(input.runId){
   await tx.$queryRaw`SELECT "id" FROM "payroll_runs" WHERE "id"=${input.runId} AND "companyId"=${ctx.companyId} FOR UPDATE`
   run=await tx.payrollRun.findFirst({where:{id:input.runId,companyId:ctx.companyId,status:'COMPUTED',runType:{in:['REGULAR','FINAL_PAY']},computationStartedAt:null}})
   if(!run)throw Error('Select a computed, unapproved payroll that is not being recalculated.')
   if(run.payDate.toISOString().slice(0,10)!==input.payDate)throw Error('The payroll payment date changed. Refresh the available runs.')
   if(await tx.payslip.findUnique({where:{payrollRunId_employeeId:{payrollRunId:run.id,employeeId:input.input.employeeId}}}))throw Error('The employee already has a payslip in this run. Choose another run to avoid duplicate wages.')
  }else run=await tx.payrollRun.create({data:{companyId:ctx.companyId,runType:'FINAL_PAY',periodLabel:`Final Pay - ${input.payDate}`,payGroupLabel:'Final Pay',periodStart:new Date(input.input.lastWorkingDay+'T00:00:00Z'),periodEnd:new Date(input.input.lastWorkingDay+'T00:00:00Z'),payDate:date,payFrequency:'MONTHLY',status:'COMPUTED',createdBy:ctx.userId,employeeScopeMode:'CUSTOM',employeeIds:[],notes:'Reviewed final-pay statement. Reconcile leave and loan balances separately after payment.'}})
  const ytd=await tx.payslip.aggregate({where:{employeeId:input.input.employeeId,payrollRun:{companyId:ctx.companyId,payDate:{gte:new Date(Date.UTC(date.getUTCFullYear(),0,1)),lte:date}}},_sum:{grossPay:true,taxableIncome:true,withholdingTax:true}})
  await tx.payslip.create({data:{...slip,employeeId:input.input.employeeId,payrollRunId:run.id,ytdGrossPay:Number(ytd._sum.grossPay??0)+slip.grossPay,ytdTaxableIncome:Number(ytd._sum.taxableIncome??0)+slip.taxableIncome,ytdWithholdingTax:Number(ytd._sum.withholdingTax??0)+slip.withholdingTax,calculationBasis:{kind:'FINAL_PAY',requestId:input.requestId,reviewHash:input.reviewHash,reviewedBy:ctx.userId,input:JSON.parse(JSON.stringify(input.input)),statement:computed,calculatedAt:new Date().toISOString()}}})
  const totals=await tx.payslip.aggregate({where:{payrollRunId:run.id},_sum:{basicSalary:true,grossPay:true,totalDeductions:true,netPay:true}})
  const updated=await tx.payrollRun.updateMany({where:{id:run.id,status:'COMPUTED',companyId:ctx.companyId,computationStartedAt:null},data:{totalBasic:totals._sum.basicSalary??0,totalGross:totals._sum.grossPay??0,totalDeductions:totals._sum.totalDeductions??0,totalNetPay:totals._sum.netPay??0,...(run.employeeScopeMode==='CUSTOM'?{employeeIds:[...new Set([...run.employeeIds,input.input.employeeId])]}:{})}})
  if(!updated.count)throw Error('Payroll status changed. Refresh and try again.')
  return{runId:run.id,existing:false}
 },{timeout:60000,maxWait:10000})
 if(!output.existing)await logAudit(ctx,'CREATE','PayrollRun',output.runId,{description:'Added reviewed final pay',newValues:{employeeId:input.input.employeeId}}).catch(()=>{})
 return NextResponse.json(output,{status:output.existing?200:201})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to create final-pay payroll.'},{status:409})}
}
