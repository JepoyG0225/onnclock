import { zonedInstant } from './timezone'
import { halfDayWindows } from './half-day-leave'
export type HalfDayWindow = { start:string; end:string; shiftStart:string; shiftEnd:string; breakStart:string; breakEnd:string; timezone:string }
export function readHalfDayWindow(value:unknown):HalfDayWindow|null {
 if(!value||typeof value!=='object')return null
 const w=value as HalfDayWindow
 return [w.start,w.end,w.shiftStart,w.shiftEnd,w.breakStart,w.breakEnd].every(v=>typeof v==='string'&&Number.isFinite(Date.parse(v)))&&typeof w.timezone==='string'?w:null
}
export function customHalfDayWindow(date:Date,schedule:{timeIn:string|null;timeOut:string|null;breakMinutes?:number|null;timezone:string},start:string,end:string):HalfDayWindow {
 const valid=(v:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v)
 if(!schedule.timeIn||!schedule.timeOut||!valid(start)||!valid(end))throw Error('Choose valid hours within your scheduled shift.')
 const w=halfDayWindows(schedule)
 const minute=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3))
 const offset=(v:string)=>minute(v)+(minute(v)<w.start?1440:0)
 const a=offset(start),b=offset(end)
 if(a<w.start||b>w.end||b<=a)throw Error('Leave hours must be within your shift, with the end after the start.')
 const overlap=Math.max(0,Math.min(b,w.secondStart)-Math.max(a,w.firstEnd))
 const expected=(w.end-w.start-(w.secondStart-w.firstEnd))/2
 if(Math.abs(b-a-overlap-expected)>0.01)throw Error(`Select exactly ${expected/60} working hours. The scheduled meal break does not count as leave.`)
 const instant=(n:number)=>zonedInstant(new Date(date.getTime()+Math.floor(n/1440)*86400000),`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`,schedule.timezone).toISOString()
 return {start:instant(a),end:instant(b),shiftStart:instant(w.start),shiftEnd:instant(w.end),breakStart:instant(w.firstEnd),breakEnd:instant(w.secondStart),timezone:schedule.timezone}
}
export type ExcludedWindow={start:Date;end:Date}
export function excludedMinutes(start:Date,end:Date,windows:ExcludedWindow[]=[]){
 const ranges=windows.map(w=>[Math.max(start.getTime(),w.start.getTime()),Math.min(end.getTime(),w.end.getTime())]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);let total=0,last=-Infinity
 for(const [a,b] of ranges){total+=Math.max(0,b-Math.max(a,last));last=Math.max(last,b)}return total/60000
}

export function halfDayWindowLabel(value:unknown){const w=readHalfDayWindow(value);if(!w)return null;const f=(v:string)=>new Date(v).toLocaleString('en-PH',{timeZone:w.timezone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});return `${f(w.start)} - ${f(w.end)} (${w.timezone})`}
