 'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { phToday } from '@/lib/hr-center/policy'
import { responseJson } from './common'
import { toast } from 'sonner'
export function SafetyExport(){const [from,setFrom]=useState(phToday().slice(0,7)+'-01'),[to,setTo]=useState(phToday()),[busy,setBusy]=useState(false)
 async function download(){setBusy(true);try{const r=await fetch('/api/hr-center/safety-report?'+new URLSearchParams({from,to}));if(!r.ok){await responseJson(r);return}const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download=`safety-incidents-${from}-${to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){toast.error(e instanceof Error?e.message:'Export failed.')}finally{setBusy(false)}}
 return <details className="rounded-xl border bg-white p-3"><summary className="cursor-pointer font-medium">Safety report / incident register</summary><div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-sm">Incident date from<Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm">To<Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><Button disabled={busy||!from||!to||from>to} onClick={()=>void download()}>Export full register (CSV)</Button></div><p className="mt-3 text-xs text-slate-500">Includes employee, injury, investigation, lost days, corrective actions and official references. This is a preparation register, not an official filed WAIR.</p><div className="mt-2 flex flex-wrap gap-4 text-sm text-blue-700 underline"><a href="https://bwc.dole.gov.ph/occupational-safety-and-health-forms/" target="_blank" rel="noreferrer">Official DOLE forms</a><a href="https://reports.dole.gov.ph/" target="_blank" rel="noreferrer">DOLE reporting portal</a></div></details>
}
