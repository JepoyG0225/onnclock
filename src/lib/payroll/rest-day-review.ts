import { prisma } from '@/lib/prisma'
/** Do not finalize a previously computed run after a rest-day shift was added or left unresolved. */
export async function restDayPayrollIssue(runId:string,companyId:string,start:Date,end:Date){
 const slips=await prisma.payslip.findMany({where:{payrollRunId:runId,employee:{companyId}},select:{employeeId:true,calculationBasis:true}})
 if(slips.length&&slips.every(s=>['THIRTEENTH_MONTH','LEAVE_ENCASHMENT','FINAL_PAY'].includes((s.calculationBasis as {kind?:string}|null)?.kind??'')))return null
 const rows=await prisma.dTRRecord.findMany({where:{employeeId:{in:slips.filter(s=>(s.calculationBasis as {kind?:string}|null)?.kind!=='FINAL_PAY').map(s=>s.employeeId)},isRestDay:true,restDayApproval:{not:null},date:{gte:start,lte:end}},select:{id:true,restDayApproval:true,timeOut:true,employeeId:true}})
 for(const row of rows){
  if(row.restDayApproval!=='APPROVED'||!row.timeOut)return 'Resolve rest-day shift approvals and complete attendance before finalizing payroll.'
  const basis=slips.find(s=>s.employeeId===row.employeeId)?.calculationBasis as {restDayBreakdown?:{attendanceId:string}[]}|null
  if(!basis?.restDayBreakdown?.some(day=>day.attendanceId===row.id))return 'Rest-day attendance changed after this payroll was computed. Recompute payroll before finalizing.'
 }
 return null
}
