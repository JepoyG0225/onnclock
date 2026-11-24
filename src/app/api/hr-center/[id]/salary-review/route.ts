import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrAccess } from '@/lib/hr-center/access'
import { HrError,jsonData,addEvent } from '@/lib/hr-center/service'
import { approvedChanges } from '@/lib/salary/service'
import { calculateSalary,retroDifference,type SalarySnapshot } from '@/lib/salary/calculation'
import type { Prisma } from '@prisma/client'
async function preview(tx:Prisma.TransactionClient,companyId:string,id:string){
 const record=await tx.hrOperation.findFirst({where:{id,companyId,kind:'SALARY_CHANGE',status:'APPROVED'}})
 if(!record)throw new HrError('Approved salary change not found.',404)
 const records=await tx.hrOperation.findMany({where:{companyId,employeeId:record.employeeId,kind:'SALARY_CHANGE',status:'APPROVED'}})
 const history=approvedChanges(records),data=record.data as Record<string,unknown>
 const prior=records.filter(r=>r.id!==id).flatMap(r=>{const d=r.data as Record<string,unknown>;return d.retroItems as {sourceId:string;basic:number;other:number}[]??[]})
 const slips=await tx.payslip.findMany({where:{employeeId:record.employeeId!,payrollRun:{companyId,periodEnd:{gte:new Date(String(data.effectiveDate))},status:{in:['LOCKED','DISBURSED']}}},include:{payrollRun:{select:{periodStart:true,periodEnd:true,payDate:true}}},orderBy:{createdAt:'asc'}})
 const issues:string[]=[],items:{sourceId:string;period:string;basic:number;other:number;total:number}[]=[]
 for(const slip of slips){
  // A reimbursement run may itself contain retro pay; only its own dated wages are compared.
  const snapshot=(slip.calculationBasis as {salarySnapshot?:SalarySnapshot}|null)?.salarySnapshot
  const period=slip.payrollRun.periodStart.toISOString().slice(0,10)+' to '+slip.payrollRun.periodEnd.toISOString().slice(0,10)
  if(!snapshot||slip.manualEdits){issues.push(period+': missing an exact dated salary snapshot or contains manual overrides. Review separately before scheduling retro pay.');continue}
  const after=calculateSalary(snapshot,history),diff=retroDifference(snapshot,after)
  const previous=prior.filter(p=>p.sourceId===slip.id)
  const basic=Number((diff.basic-previous.reduce((n,p)=>n+p.basic,0)).toFixed(2)),other=Number((diff.other-previous.reduce((n,p)=>n+p.other,0)).toFixed(2))
  if(basic||other)items.push({sourceId:slip.id,period,basic,other,total:Number((basic+other).toFixed(2))})
 }
 return {record,data,items,issues}
}
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const a=await hrAccess();if(a.error)return a.error
 if(!a.kinds.includes('SALARY_CHANGE'))return NextResponse.json({error:'Access denied.'},{status:403})
 try{const {id}=await params;const p=await preview(prisma,a.ctx.companyId,id)
 const runs=await prisma.payrollRun.findMany({where:{companyId:a.ctx.companyId,status:{in:['DRAFT','COMPUTED']}},select:{id:true,periodStart:true,periodEnd:true,payDate:true},orderBy:{payDate:'desc'},take:100})
 return NextResponse.json({...p,runs},{headers:{'Cache-Control':'private, no-store'}})
 }catch(e){if(e instanceof HrError)return NextResponse.json({error:e.message},{status:e.status});throw e}
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const a=await hrAccess();if(a.error)return a.error
 if(!a.granted.includes('salarychanges:approve')||!a.kinds.includes('SALARY_CHANGE'))return NextResponse.json({error:'Salary approval permission required.'},{status:403})
 const {id}=await params,body=await req.json().catch(()=>null)
 if(!body||typeof body.runId!=='string'||typeof body.note!=='string'||body.note.trim().length<5||body.note.length>2000)return NextResponse.json({error:'Select a payroll run and enter a review note.'},{status:422})
 try{const result=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${a.ctx.companyId}))`
  const p=await preview(tx,a.ctx.companyId,id)
  if(p.record.createdBy===a.ctx.userId||p.record.employeeId===a.employeeId)throw new HrError('An independent salary approver must authorize retro pay.',403)
  if(p.data.retroTargetRunId)throw new HrError('Retro pay has already been scheduled for this change.',409)
  if(p.issues.length)throw new HrError(p.issues.join(' '),409)
  if(!p.items.length)throw new HrError('No unpaid retroactive difference found in locked payrolls.')
  if(p.items.some(i=>i.basic<0||i.other<0))throw new HrError('This change includes a recovery or deduction. Review it separately; it cannot be automatically added as retro pay.')
  if(JSON.stringify(body.items)!==JSON.stringify(p.items))throw new HrError('Retro pay changed. Refresh and review again.',409)
  const run=await tx.payrollRun.findFirst({where:{id:body.runId,companyId:a.ctx.companyId,status:{in:['DRAFT','COMPUTED']}}})
  if(!run)throw new HrError('Choose an editable payroll run.',409)
  const employee=await tx.employee.findFirst({where:{id:p.record.employeeId!,companyId:a.ctx.companyId,isActive:true}})
  if(!employee||(run.employeeScopeMode==='CUSTOM'&&!run.employeeIds.includes(employee.id))||(run.employeeScopeMode==='EMPLOYMENT_TYPE'&&!run.employmentTypeFilter.includes(employee.employmentType)))throw new HrError('The employee must be active and included in the target payroll scope.')
  if(run.computationStartedAt)throw new HrError('Wait for payroll computation to finish.',409)
  const sources=await tx.payslip.findMany({where:{id:{in:p.items.map(i=>i.sourceId)}},include:{payrollRun:{select:{periodEnd:true}}}})
  if(sources.some(s=>s.payrollRun.periodEnd>=run.periodStart))throw new HrError('The target payroll must start after all source payroll periods.')
  const data={...p.data,retroTargetRunId:run.id,retroItems:p.items,retroReviewedBy:a.ctx.userId,retroNote:body.note.trim()}
  await tx.hrOperation.update({where:{id},data:{data:jsonData(data),version:{increment:1}}})
  // A computed run must be recalculated before it can be submitted or approved.
  await tx.payrollRun.update({where:{id:run.id},data:{status:'DRAFT'}})
  await addEvent(tx,id,a.ctx.userId,'RETRO_SCHEDULED',{runId:run.id,items:p.items,note:body.note.trim()})
  return {runId:run.id}
 });return NextResponse.json(result)
 }catch(e){if(e instanceof HrError)return NextResponse.json({error:e.message},{status:e.status});throw e}
}

export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const a=await hrAccess();if(a.error)return a.error
 if(!a.granted.includes('salarychanges:approve'))return NextResponse.json({error:'Salary approval permission required.'},{status:403})
 const {id}=await params
 try{await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${a.ctx.companyId}))`
  const r=await tx.hrOperation.findFirst({where:{id,companyId:a.ctx.companyId,kind:'SALARY_CHANGE',status:'APPROVED'}})
  if(!r)throw new HrError('Salary change not found.',404)
  const d=r.data as Record<string,unknown>,target=String(d.retroTargetRunId??'')
  const run=await tx.payrollRun.findFirst({where:{id:target,companyId:a.ctx.companyId,status:{in:['DRAFT','COMPUTED']}}})
  if(!run||run.computationStartedAt)throw new HrError('Only retro pay on an editable, idle payroll can be unscheduled.',409)
  // Do not free an earlier allocation already used by a later retro review.
  const later=await tx.hrOperation.findMany({where:{companyId:a.ctx.companyId,employeeId:r.employeeId,kind:'SALARY_CHANGE',status:'APPROVED',id:{not:id}}})
  if(later.some(x=>{const v=x.data as Record<string,unknown>;return v.retroTargetRunId&&String(v.effectiveDate)>String(d.effectiveDate)}))throw new HrError('Unschedule later retro adjustments first.',409)
  const payload={...d};delete payload.retroTargetRunId;delete payload.retroItems;delete payload.retroReviewedBy;delete payload.retroNote
  await tx.hrOperation.update({where:{id},data:{data:jsonData(payload),version:{increment:1}}})
  await tx.payrollRun.update({where:{id:run.id},data:{status:'DRAFT'}})
  await addEvent(tx,id,a.ctx.userId,'RETRO_UNSCHEDULED',{runId:run.id,items:d.retroItems})
 });return NextResponse.json({success:true})}catch(e){if(e instanceof HrError)return NextResponse.json({error:e.message},{status:e.status});throw e}
}
