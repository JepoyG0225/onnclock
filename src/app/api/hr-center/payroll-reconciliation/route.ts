import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrAccess,personSelect } from '@/lib/hr-center/access'
import { reconcileSlip,round } from '@/lib/hr-center/reconciliation'
export async function GET(req:NextRequest) {
 const a=await hrAccess();if(a.error)return a.error
 if(!a.granted.includes('payroll:read'))return NextResponse.json({error:'Access denied.'},{status:403})
 const runs=await prisma.payrollRun.findMany({where:{companyId:a.ctx.companyId},orderBy:{periodStart:'desc'},take:200,select:{id:true,periodLabel:true,status:true,payGroupLabel:true}})
 const id=req.nextUrl.searchParams.get('run')??runs[0]?.id
 if(!id)return NextResponse.json({runs,run:null,rows:[],totals:[],omitted:[]})
 const run=await prisma.payrollRun.findFirst({where:{id,companyId:a.ctx.companyId},include:{payslips:{include:{employee:{select:personSelect}},orderBy:{employee:{lastName:'asc'}}}}})
 if(!run)return NextResponse.json({error:'Payroll run not found.'},{status:404})
 const prior=await prisma.payrollRun.findFirst({where:{companyId:a.ctx.companyId,periodEnd:{lt:run.periodStart},payFrequency:run.payFrequency,payGroupLabel:run.payGroupLabel,employeeScopeMode:run.employeeScopeMode,status:{not:'DRAFT'}},orderBy:{periodEnd:'desc'},include:{payslips:{include:{employee:{select:personSelect}}}}})
 const rows=run.payslips.map(p=>({id:p.id,employee:p.employee,basicSalary:Number(p.basicSalary),grossPay:Number(p.grossPay),totalDeductions:Number(p.totalDeductions),netPay:Number(p.netPay),sssEmployee:Number(p.sssEmployee),philhealthEmployee:Number(p.philhealthEmployee),pagibigEmployee:Number(p.pagibigEmployee),withholdingTax:Number(p.withholdingTax),...reconcileSlip(p as unknown as Record<string,unknown>,prior?.payslips.find(old=>old.employeeId===p.employeeId) as unknown as Record<string,unknown>??null)}))
 const totals=([['totalBasic','basicSalary'],['totalGross','grossPay'],['totalDeductions','totalDeductions'],['totalNetPay','netPay']] as const).map(([runKey,slipKey])=>{const saved=Number(run[runKey]),sum=round(rows.reduce((s,r)=>s+r[slipKey],0));return {label:runKey,saved,sum,difference:round(saved-sum)}})
 const omitted=prior?.payslips.filter(p=>!rows.some(r=>r.employee.id===p.employeeId)).map(p=>p.employee)??[]
 return NextResponse.json({runs,run:{id:run.id,periodLabel:run.periodLabel,status:run.status,periodStart:run.periodStart,periodEnd:run.periodEnd},prior:prior?{id:prior.id,periodLabel:prior.periodLabel}:null,rows,totals,omitted},{headers:{'Cache-Control':'private, no-store'}})
}
