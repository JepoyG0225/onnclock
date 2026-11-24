import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { THIRTEENTH_RUN, thirteenthTaxSplit } from '@/lib/payroll/thirteenth-run'
import { z } from 'zod'
const schema = z.object({ year: z.number().int().min(2000).max(2100), payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reviewed: z.literal(true), entries: z.array(z.object({ id: z.string().min(1), updatedAt: z.string().datetime(), amount: z.number().positive(), priorBenefits: z.number().finite().min(0).max(1e9), withholdingTax: z.number().finite().min(0) })).min(1).max(10000) })
export async function POST(req: NextRequest) {
  const {ctx,error}=await requireAuth(); if(error)return error
  if(!await ctxHasPermission(ctx,'payroll:write'))return NextResponse.json({error:'Payroll write access is required.'},{status:403})
  const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Review all employees, amounts, taxes and the payment date.'},{status:422})
  const input=parsed.data, payDate=new Date(input.payDate+'T00:00:00Z')
  if(!Number.isFinite(payDate.getTime())||payDate.toISOString().slice(0,10)!==input.payDate||payDate.getUTCFullYear()<input.year)return NextResponse.json({error:'Choose a valid payment date in or after the selected year.'},{status:422})
  try {
    const result=await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
      const company=await tx.company.findUniqueOrThrow({where:{id:ctx.companyId},select:{payrollCurrency:true,thirteenthPayStartMonth:true,thirteenthPayStartDay:true,thirteenthPayEndMonth:true,thirteenthPayEndDay:true}})
      if((company.payrollCurrency||'PHP').toUpperCase()!=='PHP')throw new Error('13th-month tax review currently requires PHP payroll currency.')
      const logs=await tx.thirteenthMonthLog.findMany({where:{companyId:ctx.companyId,year:input.year,thirteenthAmount:{gt:0}},include:{employee:{select:{isExemptFromTax:true}}},orderBy:{id:'asc'}})
      const linked=logs.find(l=>l.payrollRunId&&!l.isPaid)
      if(linked)return {runId:linked.payrollRunId!,existing:true}
      const eligible=logs.filter(l=>!l.isPaid&&!l.payrollRunId)
      if(!eligible.length)throw new Error('No unpaid computed amounts are available. Compute the selected year first.')
      const review=new Map(input.entries.map(e=>[e.id,e]))
      if(review.size!==input.entries.length||review.size!==eligible.length||eligible.some(l=>!review.has(l.id)))throw new Error('The employee list changed. Refresh and review the entire unpaid list again.')
      const prepared=eligible.map(log=>{
        const row=review.get(log.id)!,amount=Number(log.thirteenthAmount)
        if(row.updatedAt!==log.updatedAt.toISOString()||row.amount!==amount)throw new Error('Computed amounts changed. Refresh the tax review before generating payroll.')
        const split=log.employee.isExemptFromTax?{exempt:amount,taxable:0}:thirteenthTaxSplit(amount,row.priorBenefits)
        if(row.withholdingTax>amount||(!split.taxable&&row.withholdingTax>0))throw new Error('Withholding tax must not exceed the payout and must be zero for fully exempt income.')
        return {log,row,amount,...split,tax:Number(row.withholdingTax.toFixed(2))}
      })
      const money=(n:number)=>Number(n.toFixed(2)),gross=money(prepared.reduce((n,p)=>n+p.amount,0)),tax=money(prepared.reduce((n,p)=>n+p.tax,0))
      const wraps=company.thirteenthPayStartMonth>company.thirteenthPayEndMonth||(company.thirteenthPayStartMonth===company.thirteenthPayEndMonth&&company.thirteenthPayStartDay>company.thirteenthPayEndDay)
      const run=await tx.payrollRun.create({data:{companyId:ctx.companyId,runType:THIRTEENTH_RUN,periodLabel:`13th Month Pay - ${input.year}`,payGroupLabel:'13th Month Pay',periodStart:new Date(Date.UTC(input.year-(wraps?1:0),company.thirteenthPayStartMonth-1,company.thirteenthPayStartDay)),periodEnd:new Date(Date.UTC(input.year,company.thirteenthPayEndMonth-1,company.thirteenthPayEndDay)),payFrequency:'MONTHLY',payDate,status:'COMPUTED',createdBy:ctx.userId,employeeScopeMode:'CUSTOM',employeeIds:eligible.map(l=>l.employeeId),totalBasic:0,totalGross:gross,totalDeductions:tax,totalNetPay:money(gross-tax),notes:'Generated from reviewed 13th-month amounts. Approval and disbursement follow the payroll workflow.'}})
      const prior=await tx.payslip.groupBy({by:['employeeId'],where:{employeeId:{in:eligible.map(l=>l.employeeId)},payrollRun:{companyId:ctx.companyId,id:{not:run.id},status:{in:['COMPUTED','FOR_APPROVAL','APPROVED','LOCKED','DISBURSED']},payDate:{gte:new Date(Date.UTC(payDate.getUTCFullYear(),0,1)),lte:payDate}}},_sum:{grossPay:true,taxableIncome:true,withholdingTax:true}})
      const payslipData=prepared.map(p=>{
        const ytd=prior.find(row=>row.employeeId===p.log.employeeId)?._sum
        return {payrollRunId:run.id,employeeId:p.log.employeeId,basicSalary:0,dailyRate:0,daysWorked:0,hoursWorked:0,otherEarnings:p.amount,grossPay:p.amount,totalDeductions:p.tax,withholdingTax:p.tax,netPay:money(p.amount-p.tax),taxableIncome:p.taxable,nonTaxableIncome:p.exempt,ytdGrossPay:Number(ytd?.grossPay??0)+p.amount,ytdTaxableIncome:Number(ytd?.taxableIncome??0)+p.taxable,ytdWithholdingTax:Number(ytd?.withholdingTax??0)+p.tax,manualEdits:{customIncomes:[{label:'13th Month Pay',amount:p.amount}]},calculationBasis:{kind:THIRTEENTH_RUN,year:input.year,sourceLogId:p.log.id,sourceUpdatedAt:p.log.updatedAt.toISOString(),totalBasicPaid:Number(p.log.totalBasicPaid),priorBenefits:p.row.priorBenefits,taxExempt:p.exempt,taxable:p.taxable,reviewedBy:ctx.userId,calculatedAt:new Date().toISOString()}}
      })
      await tx.payslip.createMany({data:payslipData})
      await tx.thirteenthMonthLog.updateMany({where:{companyId:ctx.companyId,id:{in:eligible.map(l=>l.id)},payrollRunId:null,isPaid:false},data:{payrollRunId:run.id}})
      return {runId:run.id,existing:false}
    },{timeout:60000,maxWait:10000})
    if(!result.existing)await logAudit(ctx,'CREATE','PayrollRun',result.runId,{description:`Generated reviewed 13th-month payroll for ${input.year}`}).catch(()=>{})
    return NextResponse.json(result,{status:result.existing?200:201})
  }catch(err){return NextResponse.json({error:err instanceof Error?err.message:'Could not generate payroll.'},{status:409})}
}
