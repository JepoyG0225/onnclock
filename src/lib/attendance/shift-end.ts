/** Shift dates are stored as date-only UTC; schedule clock values are Philippine time. */
export function scheduledShiftEnd(date:Date,timeIn:Date,start:string|null,end:string|null):Date|null{
 const parse=(s:string|null)=>{const m=s?.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);if(!m)return null;const h=Number(m[1]),n=Number(m[2]);return h<24&&n<60?h*60+n:null}
 const from=parse(start),to=parse(end);if(from===null||to===null||from===to)return null
 const day=date.toISOString().slice(0,10)
 let result=new Date(day+'T00:00:00+08:00').getTime()+to*60000+(to<from?86400000:0)
 // If the DTR date is the post-midnight clock-in date, resolve the preceding overnight start.
 if(to<from){const localMinute=(timeIn.getUTCHours()*60+timeIn.getUTCMinutes()+480)%1440;const localDate=new Date(timeIn.getTime()+8*3600000).toISOString().slice(0,10);if(localDate===day&&localMinute<to)result-=86400000}
 if(result<=timeIn.getTime())return null
 return new Date(result)
}
