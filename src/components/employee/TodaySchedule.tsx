"use client"
import { AppSpinner } from '@/components/ui/AppSpinner'

import { ScheduleLocalTime } from './ScheduleLocalTime'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, RefreshCw } from 'lucide-react'
type Day = { date: string; shifts: { timezone?:string;scheduledStart?:string|null;scheduledEnd?:string|null; name: string; timeIn: string|null; timeOut: string|null; isRestDay: boolean; nextDay: boolean; breakMinutes: number|null }[] }
const time = (value: string) => { const [h,m]=value.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}` }
export function TodaySchedule(){
 const [day,setDay]=useState<Day|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{let active=true;let sequence=0;async function load(){const current=++sequence;try{const r=await fetch('/api/employees/me/schedule',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to load schedule.');if(active&&current===sequence){setDay(d.days?.[0]??null);setError('')}}catch{if(active&&current===sequence){setDay(null);setError('Unable to load today\'s schedule. Please reconnect and retry.')}}}void load();const timer=setInterval(load,60000);const focus=()=>void load();window.addEventListener('focus',focus);window.addEventListener('online',focus);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('online',focus)}},[retry])
 return (
   <section aria-label="Today's schedule" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3">
     <div className="mb-2 flex items-center justify-between gap-2">
       <h2 className="flex min-w-0 items-center gap-2 text-xs font-semibold text-primary"><CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-accent"/>Today's schedule</h2>
       <div className="flex shrink-0 items-center gap-1"><Link href="/portal/clock?tab=schedule" className="rounded-md px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50">View week</Link><button type="button" aria-label="Refresh today's schedule" onClick={()=>setRetry(n=>n+1)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><RefreshCw className="h-3.5 w-3.5"/></button></div>
     </div>
     {error ? <p role="alert" className="text-xs text-red-600">Schedule unavailable. Retry.</p>
       : !day ? <AppSpinner size="sm" message="Loading..." className="py-1" />
       : !day.shifts.length ? <p className="text-xs text-slate-600">No schedule assigned</p>
       : <div className="space-y-2">{day.shifts.map((shift,index)=><div key={index} className="min-w-0 rounded-lg bg-slate-50 px-3 py-2">
           <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold leading-5 text-primary">
             {shift.isRestDay ? 'Rest day' : shift.timeIn && shift.timeOut ? <><span className="whitespace-nowrap">{time(shift.timeIn)}</span><span aria-hidden="true">-</span><span className="whitespace-nowrap">{time(shift.timeOut)}</span>{shift.nextDay&&<span className="whitespace-nowrap text-[10px] font-medium text-slate-500">(+1 day)</span>}</> : 'No fixed hours'}
           </div>
           <div className="mt-1 min-w-0 break-words"><ScheduleLocalTime shift={shift}/></div>
           {!shift.isRestDay && shift.breakMinutes !== null && shift.breakMinutes > 0 && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{shift.breakMinutes} min break</p>}
         </div>)}</div>}
   </section>
 )
}
