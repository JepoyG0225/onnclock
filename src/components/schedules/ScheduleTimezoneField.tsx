'use client'
import { useEffect,useState } from 'react'
const common=['Asia/Manila','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Australia/Sydney','Asia/Singapore','UTC']
export function ScheduleTimezoneField({value,onChange}:{value?:string;onChange:(value:string)=>void}){
 const [zones,setZones]=useState(common)
 useEffect(()=>{const intl=Intl as typeof Intl & {supportedValuesOf?:(key:string)=>string[]};setZones([...new Set([...common,...(intl.supportedValuesOf?.('timeZone')??[]),value??'Asia/Manila'])])},[value])
 return <label className="block text-xs font-semibold text-slate-600">Schedule timezone<select className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={value??'Asia/Manila'} onChange={e=>onChange(e.target.value)}>{zones.map(zone=><option key={zone}>{zone}</option>)}</select><span className="mt-1 block text-[11px] font-normal text-slate-500">Enter shift hours in this timezone. Daylight saving changes are automatic. Employees also see their device-local time.</span></label>
}
