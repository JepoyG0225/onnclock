'use client'
import { useEffect,useState } from 'react'
type Shift={timezone?:string;scheduledStart?:string|null;scheduledEnd?:string|null;isRestDay?:boolean}
export function ScheduleLocalTime({shift}:{shift:Shift}){
 const [zone,setZone]=useState('')
 useEffect(()=>setZone(Intl.DateTimeFormat().resolvedOptions().timeZone),[])
 if(shift.isRestDay)return null
 const format=(value:string)=>new Date(value).toLocaleString('en-US',{timeZone:zone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
 return <span className="block text-[10px] leading-4 text-slate-500">{shift.timezone??'Asia/Manila'}{zone&&zone!==shift.timezone&&shift.scheduledStart&&shift.scheduledEnd&&<span className="block text-blue-700">Your time: {format(shift.scheduledStart)} – {format(shift.scheduledEnd)} ({zone})</span>}</span>
}
