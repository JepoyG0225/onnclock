import { correctionSource } from '@/lib/payroll/correction-source'
import { NextRequest,NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { POST as compute } from '../compute/route'
import { correctionAmounts,correctionDifference,correctionHash, type CorrectionAmounts } from '@/lib/payroll/corrections'
import { Prisma } from '@prisma/client'
const editable=['DRAFT','COMPUTED']
export async function GET(_req:NextRequest,{params}:{params:Promise<{runId:string}>}){
 const {ctx,error}=await requireAuth();if(error)return error
 if(!await ctxHasPermission(ctx,'payroll:read'))return NextResponse.json({error:'Access denied'},{status:403})
 const {runId}=await params
 const run=await prisma.payrollRun.findFirst({where:{id:runId,companyId:ctx.companyId}});if(!run)return NextResponse.json({error:'Payroll not found'},{status:404})
 const [items,targets]=await Promise.all([prisma.hrOperation.findMany({where:{companyId:ctx.companyId,kind:'PAYROLL_ADJUSTMENT',OR:[{data:{path:['sourceRunId'],equals:runId}},{data:{path:['targetRunId'],equals:runId}}]},include:{employee:{select:{firstName:true,lastName:true,employeeNo:true}}},orderBy:{createdAt:'desc'}}),prisma.payrollRun.findMany({where:{companyId:ctx.companyId,runType:'REGULAR',status:{in:['DRAFT','COMPUTED']},periodStart:{gt:run.periodEnd}},select:{id:true,periodLabel:true},orderBy:{periodStart:'asc'}})])
 return NextResponse.json({items,targets})
}
export async function POST(req:NextRequest,{params}:{params:Promise<{runId:string}>}){
 const {ctx,error}=await requireAuth();if(error)return error
 const body=await req.json().catch(()=>null);if(!body)return NextResponse.json({error:'Invalid request'},{status:422})
 const permission=['approve','reject'].includes(body.action)?'payroll:approve':'payroll:write'
 if(!await ctxHasPermission(ctx,permission))return NextResponse.json({error:'Access denied'},{status:403})
 const {runId}=await params
 const run=await prisma.payrollRun.findFirst({where:{id:runId,companyId:ctx.companyId}})
 if(!run||run.runType!=='REGULAR')return NextResponse.json({error:'Regular payroll not found'},{status:404})
 try {
 if(body.action==='preview'||body.action==='propose'){
 if(!['APPROVED','LOCKED','DISBURSED'].includes(run.status))throw Error('Choose a finalized source payroll.')
 const sourceHash=await correctionSource(prisma,ctx.companyId,runId)
 const response=await compute(new NextRequest(new URL(`/api/payroll/${runId}/compute?review=true`,req.url),{method:'POST',headers:req.headers,body:'{}'}),{params:Promise.resolve({runId})})
 const result=await response.json();if(!response.ok)return NextResponse.json(result,{status:response.status})
 if(sourceHash!==await correctionSource(prisma,ctx.companyId,runId))throw Error('Source data changed during comparison. Try again.')
 const [originals,previous,salaries]=await Promise.all([prisma.payslip.findMany({where:{payrollRunId:runId},include:{employee:{select:{firstName:true,lastName:true,employeeNo:true}}}}),prisma.hrOperation.findMany({where:{companyId:ctx.companyId,kind:'PAYROLL_ADJUSTMENT',status:{in:['PENDING','APPROVED']},data:{path:['sourceRunId'],equals:runId}},orderBy:{createdAt:'desc'}}),prisma.hrOperation.findMany({where:{companyId:ctx.companyId,kind:'SALARY_CHANGE',status:'APPROVED'}})])
 const reviews=originals.map(s=>{
 const current=result.employees.find((e:{employeeId:string})=>e.employeeId===s.employeeId)
 const prior=previous.find(p=>p.employeeId===s.employeeId)
 const before=prior?.status==='APPROVED'?(prior.data as {after:CorrectionAmounts}).after:correctionAmounts(s as unknown as Record<string,unknown>)
 const after=current?correctionAmounts(current):before
 const diff=correctionDifference(before,after)
 const salaryRetro=salaries.some(r=>r.employeeId===s.employeeId&&((r.data as {retroItems?:{sourceId:string}[]}).retroItems??[]).some(i=>i.sourceId===s.id))
 const issue=s.manualEdits&&Object.keys(s.manualEdits as object).length?'Manual payslip overrides require separate review.':prior?.status==='PENDING'?'An adjustment is already awaiting approval.':salaryRetro?'Salary retro pay already references this payslip. Resolve it in HR Center first.':!current?(result.issues?.find((i:{employeeId:string})=>i.employeeId===s.employeeId)?.message??'Employee could not be recalculated.'):diff.basic<0||diff.other<0?'Contains a recovery or reduction. Review separately before making deductions.':null
 return {employeeId:s.employeeId,name:`${s.employee.lastName}, ${s.employee.firstName}`,employeeNo:s.employee.employeeNo,sourcePayslipId:s.id,before,after,...diff,issue,hash:correctionHash({before,after,sourceHash})}
 })
 if(body.action==='preview')return NextResponse.json({reviews})
 const item=reviews.find(r=>r.employeeId===body.employeeId)
 if(!item||item.issue||item.total<=0)throw Error(item?.issue??'No positive correction to propose.')
 if(item.hash!==body.hash)throw Error('Computation changed. Refresh the comparison before submitting.')
 if(typeof body.note!=='string'||(body.note.trim().length<5||body.note.length>5000))throw Error('Explain the reason for this adjustment (at least 5 characters).')
 await prisma.$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
 if(await tx.hrOperation.count({where:{companyId:ctx.companyId,kind:'PAYROLL_ADJUSTMENT',employeeId:item.employeeId,status:'PENDING',data:{path:['sourceRunId'],equals:runId}}}))throw Error('An adjustment is already pending.')
 const latest=await tx.hrOperation.findFirst({where:{companyId:ctx.companyId,kind:'PAYROLL_ADJUSTMENT',employeeId:item.employeeId,status:'APPROVED',data:{path:['sourceRunId'],equals:runId}},orderBy:{createdAt:'desc'}})
 if(latest&&correctionHash((latest.data as {after:unknown}).after)!==correctionHash(item.before))throw Error('A correction was approved during review. Refresh the comparison.')
 await tx.hrOperation.create({data:{companyId:ctx.companyId,employeeId:item.employeeId,kind:'PAYROLL_ADJUSTMENT',requestKey:crypto.randomUUID(),title:`Payroll correction: ${run.periodLabel}`,status:'PENDING',createdBy:ctx.userId,data:{...item,sourceHash,sourceRunId:runId,note:body.note.trim()},events:{create:{actorId:ctx.userId,action:'PROPOSED',detail:{sourceRunId:runId}}}}})
 })
 return NextResponse.json({ok:true})
 }
 if(!['approve','reject','cancel'].includes(body.action))throw Error('Unknown action')
 if(typeof body.id!=='string'||!body.id.trim())throw Error('Select a payroll adjustment.')
 if(body.action==='approve'&&(typeof body.targetRunId!=='string'||!body.targetRunId.trim()))throw Error('Select a target payroll.')
 if(typeof body.note!=='string'||(body.note.trim().length<5||body.note.length>5000))throw Error('Enter a decision note (at least 5 characters).')
 await prisma.$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
 const item=await tx.hrOperation.findFirst({where:{id:body.id,companyId:ctx.companyId,kind:'PAYROLL_ADJUSTMENT'}})
 if(!item)throw Error('Adjustment not found')
 const data=item.data as Record<string,unknown>
 if(data.sourceRunId!==runId&&data.targetRunId!==runId)throw Error('Adjustment does not belong to this payroll')
 if(body.action==='cancel'){
 if(item.status!=='APPROVED')throw Error('Only scheduled adjustments can be cancelled.')
 const target=await tx.payrollRun.findFirst({where:{id:String(data.targetRunId),companyId:ctx.companyId,status:{in:['DRAFT','COMPUTED']},computationStartedAt:null}})
 if(!target)throw Error('The target payroll is no longer editable.')
 // Do not invalidate a subsequent adjustment that used this correction as its baseline.
 const later=await tx.hrOperation.findFirst({where:{companyId:ctx.companyId,kind:'PAYROLL_ADJUSTMENT',employeeId:item.employeeId,status:{in:['APPROVED','PENDING']},createdAt:{gt:item.createdAt},data:{path:['sourceRunId'],equals:String(data.sourceRunId)}}})
 if(later)throw Error('Resolve later corrections for this source first.')
 await tx.payrollRun.update({where:{id:target.id},data:{status:'DRAFT'}})
 }else{
 if(item.status!=='PENDING')throw Error('This adjustment has already been reviewed.')
 if(body.action==='approve'){
 if(data.sourceHash!==await correctionSource(tx,ctx.companyId,String(data.sourceRunId)))throw Error('Source attendance, salary or payroll changed. Reject this proposal and generate a fresh comparison.')
 if(item.createdBy===ctx.userId)throw Error('A different payroll approver must review this adjustment.')
 const employee=await tx.employee.findFirst({where:{id:item.employeeId!,companyId:ctx.companyId,isActive:true}})
 if(!employee||employee.userId===ctx.userId)throw Error('An independent approver must review an active employee adjustment.')
 const target=await tx.payrollRun.findFirst({where:{id:body.targetRunId,companyId:ctx.companyId,runType:'REGULAR',status:{in:['DRAFT','COMPUTED']},computationStartedAt:null}})
 const source=await tx.payrollRun.findFirst({where:{id:String(data.sourceRunId),companyId:ctx.companyId,status:{in:['APPROVED','LOCKED','DISBURSED']}}})
 if(!target||!source||target.periodStart<=source.periodEnd)throw Error('Choose an editable regular payroll after the source period.')
 if(target.employeeScopeMode==='CUSTOM'&&!target.employeeIds.includes(employee.id)||target.employeeScopeMode==='EMPLOYMENT_TYPE'&&!target.employmentTypeFilter.includes(employee.employmentType))throw Error('Employee is outside the target payroll scope.')
 const pendingSalary=await tx.hrOperation.count({where:{companyId:ctx.companyId,kind:'SALARY_CHANGE',employeeId:employee.id,status:'PENDING'}})
 if(pendingSalary)throw Error('Resolve pending salary changes before approving this correction.')
 data.targetRunId=target.id;data.reviewedBy=ctx.userId
 await tx.payrollRun.update({where:{id:target.id},data:{status:'DRAFT'}})
 }
 }
 const status=body.action==='approve'?'APPROVED':body.action==='reject'?'REJECTED':'CANCELLED'
 await tx.hrOperation.update({where:{id:item.id},data:{status,data:{...data,decisionNote:body.note.trim()} as Prisma.InputJsonValue,events:{create:{actorId:ctx.userId,action:status,detail:{note:body.note.trim(),targetRunId:data.targetRunId??null} as Prisma.InputJsonValue}}}})
 },{timeout:30000})
 return NextResponse.json({ok:true})
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to review correction'},{status:409})}
}
