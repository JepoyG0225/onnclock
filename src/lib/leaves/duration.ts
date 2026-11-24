import { z } from 'zod'
import { scheduleDays } from '@/lib/attendance/schedule-display'
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Choose a valid date.').refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v},'Choose a valid date.')
export const leaveDatesSchema=z.object({startDate:date,endDate:date,isHalfDay:z.boolean().optional()}).superRefine((v,ctx)=>{
 if(v.endDate<v.startDate)ctx.addIssue({code:'custom',message:'End date must be on or after start date.'})
 if(v.startDate.slice(0,4)!==v.endDate.slice(0,4))ctx.addIssue({code:'custom',message:'File separate leave requests for each calendar year.'})
 if(v.isHalfDay&&v.startDate!==v.endDate)ctx.addIssue({code:'custom',message:'Half-day leave must use the same start and end date.'})
})
export function leaveWorkDates(startDate:string,endDate:string,assignments:Parameters<typeof scheduleDays>[1],fixed:Parameters<typeof scheduleDays>[2]){
 const start=new Date(startDate+'T00:00:00Z'),end=new Date(endDate+'T00:00:00Z')
 const count=Math.round((end.getTime()-start.getTime())/86400000)+1
 if(count<1||count>366)throw new Error('Choose a date range within one calendar year.')
 const fallback=fixed??{name:'Standard workweek',timeIn:null,timeOut:null,workDays:[1,2,3,4,5]}
 return scheduleDays(start,assignments,fallback,count).filter(d=>d.shifts.some(s=>!s.isRestDay)).map(d=>new Date(d.date+'T00:00:00Z'))
}

export function countLeaveDays(startDate:string,endDate:string,isHalfDay:boolean,assignments:Parameters<typeof scheduleDays>[1],fixed:Parameters<typeof scheduleDays>[2]){
 const days=leaveWorkDates(startDate,endDate,assignments,fixed).length
 return isHalfDay?(days?0.5:0):days
}
