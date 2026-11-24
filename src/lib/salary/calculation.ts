import { monthlyPayAmounts, type MonthlyPayDay } from '@/lib/payroll/monthly-pay'
import type { RateAmounts } from '@/lib/payroll/types'
import type { DailyBreakdown } from '@/lib/payroll/daily-breakdown'
export type SalaryChange={id:string;effectiveDate:string;amount:number;beforeAmount:number;rateType:string}
export type SalaryDay={date:string;basicUnits:number;holidayUnits:number;premiumUnits:number;otUnits:number;nightUnits:number;lateUnits:number;underUnits:number;rate:number}
export type SalarySnapshot={version:1;rateType:string;divisor:number;hours:number;days:SalaryDay[];amounts:RateAmounts;changeIds:string[];monthlyDays?:MonthlyPayDay[]}
const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100
export function salaryAt(changes:SalaryChange[],date:string,fallback:number){
 const ordered=[...changes].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate))
 let amount=ordered[0]?.beforeAmount??fallback
 for(const c of ordered){if(c.effectiveDate>date)break;amount=c.amount}
 return amount
}
export function calculateSalary(snapshot:SalarySnapshot,changes:SalaryChange[]):SalarySnapshot{
 const sums:RateAmounts={basicPay:0,regularOtAmount:0,restDayOtAmount:0,holidayOtAmount:0,nightDiffAmount:0,holidayPayAmount:0,lateDeduction:0,undertimeDeduction:0,absenceDeduction:0}
 const days=snapshot.days.map(d=>{
  const rate=salaryAt(changes,d.date,d.rate),daily=snapshot.rateType==='MONTHLY'?rate/snapshot.divisor:snapshot.rateType==='HOURLY'?rate*snapshot.hours:rate,hourly=daily/snapshot.hours
  sums.basicPay+=d.basicUnits*(snapshot.rateType==='HOURLY'?hourly:daily)+d.holidayUnits*daily
  sums.regularOtAmount+=d.otUnits*hourly;sums.nightDiffAmount+=d.nightUnits*hourly;sums.holidayPayAmount+=d.premiumUnits*(snapshot.rateType==='HOURLY'?hourly:daily)
  sums.lateDeduction+=d.lateUnits*hourly/60;sums.undertimeDeduction+=d.underUnits*hourly/60
  return {...d,rate}
 })
 const monthlyDays=snapshot.monthlyDays?.map(d=>({...d,rate:salaryAt(changes,d.date,d.rate)}))
 if(monthlyDays)Object.assign(sums,monthlyPayAmounts(monthlyDays,snapshot.divisor))
 for(const k of Object.keys(sums) as (keyof RateAmounts)[])sums[k]=money(sums[k])
 return {...snapshot,days,monthlyDays,amounts:sums,changeIds:changes.map(c=>c.id)}
}
export function salaryBreakdown(original:DailyBreakdown,snapshot:SalarySnapshot):DailyBreakdown{
 const running={basic:0,holidayCredit:0,premium:0},rounded={...running}
 const rows=original.rows.map((row,index)=>{
  const day=snapshot.days[index],daily=snapshot.rateType==='MONTHLY'?day.rate/snapshot.divisor:snapshot.rateType==='HOURLY'?day.rate*snapshot.hours:day.rate,rate=snapshot.rateType==='HOURLY'?day.rate:daily
  const allocate=(key:keyof typeof running,v:number)=>{running[key]+=v;const total=money(running[key]),amount=money(total-rounded[key]);rounded[key]=total;return amount}
  return {...row,rate,basic:allocate('basic',day.basicUnits*rate),holidayCredit:allocate('holidayCredit',day.holidayUnits*daily),premium:allocate('premium',day.premiumUnits*rate)}
 })
 return {...original,rows,basicTotal:snapshot.amounts.basicPay,premiumTotal:snapshot.amounts.holidayPayAmount,basicDifference:money(snapshot.amounts.basicPay-rounded.basic-rounded.holidayCredit),premiumDifference:money(snapshot.amounts.holidayPayAmount-rounded.premium)}
}
export function retroDifference(before:SalarySnapshot,after:SalarySnapshot){
 const a=before.amounts,b=after.amounts
 const basic=money(b.basicPay-a.basicPay)
 const other=money(b.regularOtAmount-a.regularOtAmount+b.nightDiffAmount-a.nightDiffAmount+b.holidayPayAmount-a.holidayPayAmount-(b.lateDeduction-a.lateDeduction)-(b.undertimeDeduction-a.undertimeDeduction)-(b.absenceDeduction-a.absenceDeduction))
 return {basic,other,total:money(basic+other)}
}
