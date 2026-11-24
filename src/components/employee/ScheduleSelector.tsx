 'use client'
import { AppSpinner } from '@/components/ui/AppSpinner'

import { useEffect,useState } from 'react'
type Day={date:string;shifts:{name:string;timeIn:string|null;timeOut:string|null;isRestDay:boolean}[]}
export function ScheduleSelector(_props:{showUnavailable?:boolean}){
 const [days,setDays]=useState<Day[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 useEffect(()=>{let active=true;fetch('/api/employees/me/schedule',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error??'Unable to load schedule.');if(active)setDays(d.days??[])}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[])
 return <section className="space-y-3"><h2 className="text-lg font-semibold">My assigned schedule</h2><p className="text-sm text-slate-500">Schedules are managed by your administrator. All times are Philippine time.</p>{loading?<AppSpinner size="md" message="Loading schedule..." className="py-8" />:error?<p role="alert" className="text-red-600">{error}</p>:days.map(d=><div key={d.date} className="rounded-xl border bg-white p-3"><strong className="text-sm">{d.date}</strong>{d.shifts.length?d.shifts.map((s,i)=><p key={i} className="mt-1 text-sm text-slate-600">{s.isRestDay?'Rest day':s.name+(s.timeIn&&s.timeOut?' | '+s.timeIn+' - '+s.timeOut:'')}</p>):<p className="text-sm text-slate-500">No schedule assigned</p>}</div>)}</section>
}
