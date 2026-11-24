import { NextRequest,NextResponse } from 'next/server'
import { accountingAccess } from '@/lib/accounting/access'
import { prisma } from '@/lib/prisma'
export async function GET(req:NextRequest){
 const {ctx,error}=await accountingAccess();if(error)return error
 const type=req.nextUrl.searchParams.get('type')||'PAYROLL'
 const page=Math.max(1,Math.min(10000,Math.floor(Number(req.nextUrl.searchParams.get('page'))||1)))
 const pagination={take:50,skip:(page-1)*50}
 const company=await prisma.company.findUniqueOrThrow({where:{id:ctx.companyId},select:{payrollCurrency:true}})
 let rows:Array<{id:string;label:string;date:Date;amount:number;currency:string;status:string}>,total:number
 if(type==='PAYROLL'){
  const where={companyId:ctx.companyId,status:{in:['APPROVED','LOCKED','DISBURSED'] as ('APPROVED'|'LOCKED'|'DISBURSED')[]}}
  const [items,count]=await Promise.all([prisma.payrollRun.findMany({where,orderBy:{payDate:'desc'},...pagination}),prisma.payrollRun.count({where})]);total=count
  rows=items.map(c=>({id:c.id,label:c.periodLabel,date:c.payDate,amount:Number(c.totalNetPay),currency:company.payrollCurrency,status:c.status}))
 }else if(type==='CASH_ADVANCE'){
  const where={companyId:ctx.companyId,status:'APPROVED' as const};const [items,count]=await Promise.all([prisma.cashAdvanceRequest.findMany({where,include:{employee:{select:{firstName:true,lastName:true}}},orderBy:{createdAt:'desc'},...pagination}),prisma.cashAdvanceRequest.count({where})]);total=count
  rows=items.map(c=>({id:c.id,label:`${c.employee.firstName} ${c.employee.lastName}: ${c.reason}`,date:c.approvedAt||c.createdAt,amount:Number(c.amountRequested),currency:company.payrollCurrency,status:c.status}))
 }else if(type==='BUDGET'){
  const where={companyId:ctx.companyId,status:'APPROVED' as const};const [items,count]=await Promise.all([prisma.budgetRequisition.findMany({where,orderBy:{createdAt:'desc'},...pagination}),prisma.budgetRequisition.count({where})]);total=count
  rows=items.map(c=>({id:c.id,label:c.title,date:c.reviewedAt||c.createdAt,amount:Number(c.totalAmount),currency:c.currency,status:c.status}))
 }else if(type==='EXPENSE'){
  const where={companyId:ctx.companyId,status:'PAID' as const};const [items,count]=await Promise.all([prisma.expenseClaim.findMany({where,include:{employee:{select:{firstName:true,lastName:true}}},orderBy:{paidAt:'desc'},...pagination}),prisma.expenseClaim.count({where})]);total=count
  rows=items.map(c=>({id:c.id,label:`${c.employee.firstName} ${c.employee.lastName}: ${c.description}`,date:c.paidAt||c.createdAt,amount:Number(c.settledAmount??c.approvedAmount),currency:c.currency,status:c.status}))
 }else return NextResponse.json({error:'Unsupported transaction type.'},{status:422})
 const records=await prisma.accountingSyncRecord.findMany({where:{companyId:ctx.companyId,sourceType:type,sourceId:{in:rows.map(r=>r.id)}},select:{sourceId:true,provider:true,status:true,externalId:true}})
 return NextResponse.json({rows:rows.map(r=>({...r,syncs:records.filter(s=>s.sourceId===r.id)})),total,page})
}
