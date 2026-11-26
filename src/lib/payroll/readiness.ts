import { prisma } from '@/lib/prisma'
import type { PayrollRun } from '@prisma/client'
export type ReadinessIssue={employeeId:string;employeeName:string;code:string;message:string;href:string;severity:'warning'|'critical'}
export async function payrollReadiness(run:PayrollRun){
 const employees=await prisma.employee.findMany({where:{companyId:run.companyId,isActive:true,...(run.employeeScopeMode==='CUSTOM'?{id:{in:run.employeeIds}}:run.employeeScopeMode==='EMPLOYMENT_TYPE'?{employmentType:{in:run.employmentTypeFilter as ('FULL_TIME'|'PART_TIME'|'CONTRACTUAL')[]}}:{})},select:{id:true,firstName:true,lastName:true,employeeNo:true,basicSalary:true,bankName:true,bankAccountNo:true,trackTime:true,workScheduleId:true,disableEarlyInOt:true,disableBeyondScheduleOt:true}})
 const ids=employees.map(e=>e.id)
 const [rows,leaves,assignments,ots]=await Promise.all([
 prisma.dTRRecord.findMany({where:{employeeId:{in:ids},date:{gte:run.periodStart,lte:run.periodEnd}},select:{employeeId:true,timeIn:true,timeOut:true,approvedBy:true,isLeave:true,isAbsent:true,isRestDay:true,restDayApproval:true}}),
 prisma.leaveRequest.findMany({where:{employee:{companyId:run.companyId},employeeId:{in:ids},status:'PENDING',startDate:{lte:run.periodEnd},endDate:{gte:run.periodStart}},select:{employeeId:true}}),
 prisma.employeeShiftAssignment.findMany({where:{companyId:run.companyId,employeeId:{in:ids},date:{gte:run.periodStart,lte:run.periodEnd}},select:{employeeId:true}}),
 prisma.overtimeRequest.findMany({where:{companyId:run.companyId,employeeId:{in:ids},date:{gte:run.periodStart,lte:run.periodEnd},status:'PENDING'},select:{employeeId:true}})])
 const issues:ReadinessIssue[]=[]
 for(const e of employees){
 const add=(code:string,message:string,href:string,severity:'warning'|'critical'='warning')=>issues.push({employeeId:e.id,employeeName:`${e.lastName}, ${e.firstName} - ${e.employeeNo}`,code,message,href,severity})
 const attendance=rows.filter(r=>r.employeeId===e.id),profile=`/employees/${e.id}/edit?tab=compensation`,timesheets=`/timesheets?q=${encodeURIComponent(e.employeeNo)}&month=${run.periodStart.toISOString().slice(0,7)}`
 if(Number(e.basicSalary)<=0)add('salary','Salary / rate is missing or zero.',profile,'critical')
 if(!e.bankName||!e.bankAccountNo)add('bank','Bank details are incomplete. Confirm the payment method.',`/employees/${e.id}/edit`)
 if(e.trackTime){
 if(!(e.disableEarlyInOt&&e.disableBeyondScheduleOt)&&ots.some(o=>o.employeeId===e.id))add('ot','Overtime approval is pending.',timesheets)
 if(!e.workScheduleId&&!assignments.some(a=>a.employeeId===e.id))add('schedule','No work schedule is assigned for this period.','/schedules','critical')
 if(!attendance.length)add('attendance','No attendance records in this period.',timesheets)
 const open=attendance.filter(r=>r.timeIn&&!r.timeOut).length
 if(open)add('open',`${open} clock-in session(s) have no clock-out.`,timesheets,'critical')
 const pending=attendance.filter(r=>r.timeIn&&r.timeOut&&!r.approvedBy&&!r.isLeave&&!r.isAbsent).length
 if(pending)add('approval',`${pending} completed attendance session(s) await approval.`,timesheets)
 if(attendance.some(r=>r.isRestDay&&r.restDayApproval==='PENDING'))add('restday','Rest-day work approval is pending.',timesheets)
 }
 const pendingLeave=leaves.filter(l=>l.employeeId===e.id).length
 if(pendingLeave)add('leave',`${pendingLeave} leave request(s) overlap this payroll period.`,`/leaves?status=PENDING&q=${encodeURIComponent(e.employeeNo)}`)
 }
 return {employeeCount:employees.length,issues,checkedAt:new Date().toISOString()}
}
