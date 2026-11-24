import { prisma } from '@/lib/prisma'
import { buildPlan,resolveApprovers,type ApprovalRequestType } from './engine'
import type { AuthContext } from '@/lib/api-auth'
type Request={employeeId?:string;approvalLevel?:number|null;employee?:{id?:string;departmentId?:string|null};[key:string]:unknown}
export async function requestAudience(ctx:AuthContext){
 const admin=['COMPANY_ADMIN','SUPER_ADMIN'].includes(ctx.role)
 const [workflows,configs]=admin?[[],[]]:await Promise.all([prisma.approvalWorkflow.findMany({where:{companyId:ctx.companyId,isActive:true},include:{steps:{orderBy:{order:'asc'}}}}),prisma.approverConfig.findMany({where:{companyId:ctx.companyId},orderBy:{level:'asc'}})])
 const cache=new Map<string,Promise<string[]>>()
 return async(type:ApprovalRequestType,request:Request)=>{
  if(admin)return true
  const departmentId=request.employee?.departmentId??null,employeeId=request.employeeId??request.employee?.id
  const options=workflows.filter(w=>w.type===type),workflow=options.find(w=>departmentId&&w.departmentId===departmentId)??options.find(w=>!w.departmentId)
  if(workflow){
   const facts:Record<string,unknown>={...request,departmentId:departmentId??''}
   for(const key of ['amount','hours','totalDays','totalGross'])if(request[key]!=null)facts[key]=Number(request[key])
   if(type==='CASH_ADVANCE')facts.amount=Number(request.amountRequested)
   if(type==='BUDGET')facts.amount=Number(request.totalAmount)
   const leave=request.leaveType as {name?:string;isWithPay?:boolean}|undefined
   if(leave){facts.leaveType=leave.name??'';facts.isWithPay=!!leave.isWithPay}
   const plan=buildPlan(workflow as Parameters<typeof buildPlan>[0],facts),step=plan.approvalSteps[request.approvalLevel??0]
   if(!step)return false
   const key=step.id+':'+departmentId+':'+(step.approverType==='DEPARTMENT_HEAD'?employeeId:'')
   if(!cache.has(key))cache.set(key,resolveApprovers(step,{companyId:ctx.companyId,requesterDepartmentId:departmentId,requesterEmployeeId:employeeId}))
   return (await cache.get(key)!).includes(ctx.userId)
  }
  return configs.some(c=>c.type===type&&c.level===(request.approvalLevel??0)+1&&c.userId===ctx.userId)
 }
}
export async function visibleRequests<T extends Request>(rows:T[],type:ApprovalRequestType,canSee:Awaited<ReturnType<typeof requestAudience>>){const checks=await Promise.all(rows.map(r=>canSee(type,r)));return rows.filter((_,i)=>checks[i])}
