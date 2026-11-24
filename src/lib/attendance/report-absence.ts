import { scheduleInstants, timezone, zonedDate } from './timezone'
import { scheduledShiftEnd } from './shift-end'
type Employee = { id:string; hireDate:Date; terminationDate:Date|null; isActive:boolean; trackTime:boolean; workSchedule:{timezone?:string;workDays:unknown;timeIn:string|null;timeOut:string|null}|null }
type Assignment = {employeeId:string;date:Date;isRestDay:boolean;timeIn:string|null;timeOut:string|null;schedule:{timezone?:string;timeIn:string|null;timeOut:string|null}|null}
type Leave = {employeeId:string;startDate:Date;endDate:Date;isHalfDay:boolean}
type Row = {employeeId:string;date:Date;timeIn:Date|null;isAbsent:boolean;isLeave:boolean;isHoliday:boolean;isRestDay:boolean}
export function missingAttendanceDays(employees:Employee[], records:Row[], assignments:Assignment[], leaves:Leave[], holidays:Date[], range:{gte:Date;lt:Date}, now=new Date()) {
 const result=[]
 const key=(employeeId:string,date:Date)=>employeeId+':'+date.toISOString().slice(0,10)
 const existing=new Map<string,Row[]>(), shifts=new Map<string,Assignment[]>()
 for(const r of records){const k=key(r.employeeId,r.date);existing.set(k,[...(existing.get(k)??[]),r])}
 for(const r of assignments){const k=key(r.employeeId,r.date);shifts.set(k,[...(shifts.get(k)??[]),r])}
 const holidayDates=new Set(holidays.map(d=>d.toISOString().slice(0,10)))
 const today=new Date(now.getTime()+480*60000).toISOString().slice(0,10)
 for(const employee of employees){
  if(!employee.trackTime||(!employee.isActive&&!employee.terminationDate))continue
  for(let t=range.gte.getTime();t<range.lt.getTime();t+=86400000){
   const date=new Date(t),day=date.toISOString().slice(0,10),k=key(employee.id,date),rows=existing.get(k)??[]
   if(day>=zonedDate(now,timezone(employee.workSchedule?.timezone)).toISOString().slice(0,10)||date<employee.hireDate||(employee.terminationDate&&date>employee.terminationDate))continue
   if(rows.some(r=>r.timeIn||r.isAbsent||r.isLeave||r.isHoliday||r.isRestDay)||holidayDates.has(day))continue
   const assigned=shifts.get(k)??[]
   const work=assigned.length?assigned.filter(s=>!s.isRestDay).map(s=>({timezone:s.schedule?.timezone??employee.workSchedule?.timezone,timeIn:s.timeIn??s.schedule?.timeIn,timeOut:s.timeOut??s.schedule?.timeOut})):employee.workSchedule&&Array.isArray(employee.workSchedule.workDays)&&employee.workSchedule.workDays.includes(date.getUTCDay())?[employee.workSchedule]:[]
   if(!work.length)continue
   // Do not infer absence for an overnight shift that has not ended yet.
   if(work.some(s=>{if(!s.timeIn||!s.timeOut)return false;const end=scheduleInstants(date,s.timeIn,s.timeOut,timezone(s.timezone)).scheduledEnd;return !end||end>now}))continue
   const approved=leaves.filter(l=>l.employeeId===employee.id&&l.startDate<=date&&l.endDate>=date)
   const leaveDays=Math.min(1,approved.reduce((sum,l)=>sum+(l.isHalfDay?0.5:1),0))
   result.push({id:'derived:'+k,employeeId:employee.id,date,timeIn:null,timeOut:null,regularHours:0,overtimeHours:0,nightDiffHours:0,lateMinutes:0,undertimeMinutes:0,isAbsent:leaveDays<1,isLeave:leaveDays>0,isHoliday:false,isRestDay:false,approvedBy:null,absentDays:1-leaveDays,leaveDays,derived:true,activities:[]})
  }
 }
 return result
}
