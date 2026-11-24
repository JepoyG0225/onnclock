import { Prisma } from '@prisma/client'
import { HrError,jsonData,addEvent } from '@/lib/hr-center/service'
import { phToday } from '@/lib/hr-center/policy'
import type { SalaryChange } from './calculation'
export function approvedChanges(records:{id:string;data:unknown}[]):SalaryChange[]{return records.map(r=>({id:r.id,...r.data as Omit<SalaryChange,'id'>})).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate))}
export async function decideSalary(tx:Prisma.TransactionClient,r:{id:string;companyId:string;employeeId:string|null;createdBy:string;status:string;data:unknown},userId:string,action:string,note:string,canApprove:boolean){
 if(r.status!=='PENDING')throw new HrError('This salary request is no longer pending.',409)
 if(action==='CANCEL'){if(r.createdBy!==userId)throw new HrError('Only the requester can cancel.',403);return {status:'CANCELLED',data:jsonData(r.data)}}
 if(!canApprove||r.createdBy===userId)throw new HrError('A different user with salary approval permission must review this change.',403)
 if(!['APPROVE','REJECT'].includes(action)||!note.trim())throw new HrError('Enter the review decision note.')
 if(action==='REJECT')return {status:'REJECTED',data:jsonData(r.data)}
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${r.companyId}))`
 await tx.$queryRaw`SELECT id FROM employees WHERE id=${r.employeeId} AND "companyId"=${r.companyId} FOR UPDATE`
 const employee=await tx.employee.findFirst({where:{id:r.employeeId!,companyId:r.companyId,isActive:true}})
 if(!employee||employee.userId===userId)throw new HrError('An independent reviewer must approve an active employee salary.',403)
 const data=r.data as Record<string,unknown>
 const prior=approvedChanges(await tx.hrOperation.findMany({where:{companyId:r.companyId,employeeId:r.employeeId,kind:'SALARY_CHANGE',status:'APPROVED'}}))
 if(prior.some(c=>c.effectiveDate>=String(data.effectiveDate)))throw new HrError('The effective date must be later than the latest approved salary change. Correct an earlier change through a new dated adjustment.',409)
 if(Number(data.originalAmount)!==Number(employee.basicSalary)||data.rateType!==employee.rateType)throw new HrError('The employee rate changed after submission. Cancel and submit a new request.',409)
 const beforeAmount=prior.at(-1)?.amount??Number(employee.basicSalary)
 if(Number(data.amount)===beforeAmount)throw new HrError('The new amount matches the preceding approved rate.')
 const payload={...data,beforeAmount,approvedBy:userId,approvedAt:new Date().toISOString()}
 if(String(data.effectiveDate)<=phToday())await tx.employee.update({where:{id:employee.id},data:{basicSalary:Number(data.amount),dailyRate:employee.rateType==='HOURLY'?Number(data.amount)*8:employee.rateType==='DAILY'?Number(data.amount):Number(data.amount)/22,hourlyRate:employee.rateType==='HOURLY'?Number(data.amount):employee.rateType==='DAILY'?Number(data.amount)/8:Number(data.amount)/22/8}})
 await tx.payrollRun.updateMany({where:{companyId:r.companyId,periodEnd:{gte:new Date(String(data.effectiveDate))},status:{in:['COMPUTED','FOR_APPROVAL']}},data:{status:'DRAFT'}})
 await addEvent(tx,r.id,userId,'SALARY_RATE_APPROVED',{beforeAmount,amount:data.amount,effectiveDate:data.effectiveDate,note})
 return {status:'APPROVED',data:jsonData(payload)}
}

/** Refresh current employee cards when an approved future rate becomes effective. */
export async function activateDueSalaries(tx:Prisma.TransactionClient,companyId:string){
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`
 const records=await tx.hrOperation.findMany({where:{companyId,kind:'SALARY_CHANGE',status:'APPROVED'}})
 const employeeIds=[...new Set(records.map(r=>r.employeeId).filter((id):id is string=>!!id))]
 let updated=0
 for(const id of employeeIds){
  const history=approvedChanges(records.filter(r=>r.employeeId===id)),current=history.filter(c=>c.effectiveDate<=phToday()).at(-1)
  if(!current)continue
  const e=await tx.employee.findFirst({where:{id,companyId}})
  if(!e||e.rateType!==current.rateType||Number(e.basicSalary)===current.amount)continue
  await tx.employee.update({where:{id},data:{basicSalary:current.amount,dailyRate:e.rateType==='HOURLY'?current.amount*8:e.rateType==='DAILY'?current.amount:current.amount/22,hourlyRate:e.rateType==='HOURLY'?current.amount:e.rateType==='DAILY'?current.amount/8:current.amount/22/8}})
  updated++
 }
 return updated
}
