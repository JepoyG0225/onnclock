type Session = { id:string; date:Date; timeIn:Date|null; timeOut:Date|null; breakIn:Date|null; breakOut:Date|null; holidayType?:string|null }
export type RestDayPayRow = { date:string; attendanceId:string; hourlyRate:number; regularHours:number; overtimeHours:number; nightHours:number; multiplier:number; regularPay:number; overtimePay:number; nightPay:number; total:number }
/** Rest-day work: first eight worked hours at 130%, then that day's rate x 130%.
 * A special non-working holiday/rest day is 150%; a regular holiday/rest day is 260%.
 * Actual breaks are unpaid. No scheduled early/late deductions apply to the extra shift.
 */
export function restDayPay(sessions:Session[],rateForDate:(date:string)=>number,breakMinutes=60):RestDayPayRow[]{
 const used=new Map<string,number>(),rows:RestDayPayRow[]=[]
 for(const session of [...sessions].sort((a,b)=>(a.timeIn?.getTime()??0)-(b.timeIn?.getTime()??0))){
  if(!session.timeIn||!session.timeOut)continue
  const start=session.timeIn.getTime(),end=session.timeOut.getTime(),date=session.date.toISOString().slice(0,10)
  if(end<=start||end-start>86400000)throw new Error('Review invalid rest-day shift duration on '+date)
  const hourlyRate=rateForDate(date),multiplier=session.holidayType==='REGULAR'?2.6:session.holidayType==='SPECIAL_NON_WORKING'?1.5:1.3
  const hasBreak=!!session.breakIn&&!!session.breakOut
  const assumedBreak=!hasBreak&&end-start>=5*3600000?breakMinutes:0
  let regular=0,ot=0,night=0,ndPay=0,consumed=used.get(date)??0
  // With no recorded break, apply the agreed unpaid break after four worked hours.
  for(let minute=start;minute+60000<=end;minute+=60000){
   if(hasBreak&&minute>=session.breakIn!.getTime()&&minute<session.breakOut!.getTime())continue
   const elapsed=(minute-start)/60000
   if(assumedBreak&&elapsed>=240&&elapsed<240+assumedBreak)continue
   const overtime=consumed>=480;consumed++;if(overtime)ot++;else regular++
   const local=(new Date(minute).getUTCHours()*60+new Date(minute).getUTCMinutes()+480)%1440
   if(local>=1320||local<360){night++;ndPay+=hourlyRate*multiplier*(overtime?1.3:1)*.1/60}
  }
  used.set(date,consumed)
  const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100
  const regularPay=round(regular/60*hourlyRate*multiplier),overtimePay=round(ot/60*hourlyRate*multiplier*1.3),nightPay=round(ndPay)
  rows.push({date,attendanceId:session.id,hourlyRate,regularHours:round(regular/60),overtimeHours:round(ot/60),nightHours:round(night/60),multiplier,regularPay,overtimePay,nightPay,total:round(regularPay+overtimePay+nightPay)})
 }
 return rows
}
