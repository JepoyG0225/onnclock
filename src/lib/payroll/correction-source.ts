import type { Prisma } from '@prisma/client'
import { correctionHash } from './corrections'
export async function correctionSource(db:Prisma.TransactionClient,companyId:string,runId:string){
 const run=await db.payrollRun.findFirstOrThrow({where:{id:runId,companyId}})
 const slips=await db.payslip.findMany({where:{payrollRunId:runId},orderBy:{id:'asc'}})
 const ids=slips.map(s=>s.employeeId),period={gte:run.periodStart,lte:run.periodEnd}
 const values=await Promise.all([
 db.$queryRaw`SELECT * FROM payroll_differential_configs WHERE "companyId" = ${companyId}`,
 db.employee.findMany({where:{companyId,id:{in:ids}},include:{workSchedule:true},orderBy:{id:'asc'}}),
 db.dTRRecord.findMany({where:{employeeId:{in:ids},date:period},orderBy:{id:'asc'}}),
 db.employeeShiftAssignment.findMany({where:{companyId,employeeId:{in:ids},date:period},include:{schedule:true},orderBy:{id:'asc'}}),
 db.leaveRequest.findMany({where:{employee:{companyId},employeeId:{in:ids},startDate:{lte:run.periodEnd},endDate:{gte:run.periodStart}},include:{leaveType:true},orderBy:{id:'asc'}}),
 db.overtimeRequest.findMany({where:{companyId,employeeId:{in:ids},date:period},orderBy:{id:'asc'}}),
 db.holiday.findMany({where:{companyId,date:period},orderBy:{id:'asc'}}),
 db.hrOperation.findMany({where:{companyId,kind:'SALARY_CHANGE',employeeId:{in:ids}},orderBy:{id:'asc'}}),
 db.payrollCycleConfig.findUnique({where:{companyId}}),
 ])
 return correctionHash({slips,values})
}
