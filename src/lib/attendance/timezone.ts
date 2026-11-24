import { z } from 'zod'
export const DEFAULT_TIMEZONE='Asia/Manila'
export function validTimezone(value:string){try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return true}catch{return false}}
export const scheduleTimezoneSchema=z.string().max(100).refine(validTimezone,'Choose a valid timezone.').default(DEFAULT_TIMEZONE)
export function timezone(value?:string|null){return value&&validTimezone(value)?value:DEFAULT_TIMEZONE}
export function zonedParts(at:Date,zone=DEFAULT_TIMEZONE){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone(zone),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);const get=(key:string)=>parts.find(p=>p.type===key)!.value;return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`,minutes:Number(get('hour'))*60+Number(get('minute'))}}
export function zonedDate(at=new Date(),zone=DEFAULT_TIMEZONE){return new Date(zonedParts(at,zone).date+'T00:00:00Z')}
const dayKey=(date:Date)=>date.toISOString().slice(0,10)
/** Resolve an IANA wall clock to an instant. Repeated clocks use the first occurrence;
 * nonexistent spring-forward clocks advance by the DST gap. */
export function zonedInstant(date:Date,clock:string,zone=DEFAULT_TIMEZONE):Date{
 const wall=Date.parse(dayKey(date)+'T'+clock.slice(0,5)+':00Z'), offsets=new Set<number>()
 for(const delta of [-86400000,0,86400000]){const probe=new Date(wall+delta),p=zonedParts(probe,zone);offsets.add(Date.parse(p.date+'T'+p.time+':00Z')-probe.getTime())}
 const candidates=[...offsets].map(offset=>new Date(wall-offset)).sort((a,b)=>a.getTime()-b.getTime())
 const exact=candidates.filter(d=>{const p=zonedParts(d,zone);return p.date===dayKey(date)&&p.time===clock.slice(0,5)})
 if(exact.length)return exact[0]
 return candidates.find(d=>{const p=zonedParts(d,zone);return Date.parse(p.date+'T'+p.time+':00Z')>=wall})??candidates[candidates.length-1]
}
export function scheduleInstants(date:Date,start?:string|null,end?:string|null,zone=DEFAULT_TIMEZONE){
 if(!start||!end)return {scheduledStart:null,scheduledEnd:null}
 const endDate=new Date(date.getTime()+(end<=start?86400000:0))
 return {scheduledStart:zonedInstant(date,start,zone),scheduledEnd:zonedInstant(endDate,end,zone)}
}
