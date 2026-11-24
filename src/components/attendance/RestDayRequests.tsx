 'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
type Request = { restDayApproval:string; id:string; date:string; timeIn:string; timeOut:string|null; employee:{firstName:string;lastName:string;employeeNo:string} }
export function RestDayRequests(){
  const [rows,setRows]=useState<Request[]>([]),[canReview,setCanReview]=useState(false),[notes,setNotes]=useState<Record<string,string>>({}),[busy,setBusy]=useState(''),[error,setError]=useState('')
  const load=useCallback(async()=>{try{const response=await fetch('/api/attendance/rest-day-requests',{cache:'no-store'});if(!response.ok)throw new Error('Unable to load rest-day requests.');const data=await response.json();setRows(data.requests);setCanReview(data.canReview);setError('')}catch(e){setError(e instanceof Error?e.message:'Unable to load rest-day requests.')}},[])
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer)},[load])
  async function review(id:string,action:string){setBusy(id);try{const response=await fetch('/api/attendance/rest-day-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action,note:notes[id]||''})});const data=await response.json();if(!response.ok)throw new Error(data.error);toast.success('Rest-day shift '+action.toLowerCase());await load()}catch(e){toast.error(e instanceof Error?e.message:'Unable to review shift.')}finally{setBusy('')}}
  if(error)return <div className="rounded-xl border border-amber-200 p-3 text-sm">{error}<Button variant="ghost" onClick={()=>void load()}>Retry</Button></div>
  if(!canReview||!rows.length)return null
  return <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4"><div><h2 className="font-semibold">Rest-day shift requests ({rows.length})</h2><p className="text-xs text-slate-600">Approve permission to work this shift, even while it is in progress. Completed attendance is still reviewed separately before payroll.</p></div>{rows.map(row=><div key={row.id} className="space-y-3 rounded-lg border bg-white p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><b>{row.employee.firstName} {row.employee.lastName} ({row.employee.employeeNo})</b><span>{row.date.slice(0,10)} | {row.timeOut?'Completed':'In progress'} | {row.restDayApproval.toLowerCase()}</span></div><Input aria-label={`Review note for ${row.employee.employeeNo}`} placeholder="Review note (required for rejection)" value={notes[row.id]||''} onChange={e=>setNotes({...notes,[row.id]:e.target.value})}/><div className="flex justify-end gap-2"><Button disabled={!!busy||(notes[row.id]||'').trim().length<3} variant="outline" onClick={()=>void review(row.id,'REJECTED')}>Reject shift</Button><Button disabled={!!busy} onClick={()=>void review(row.id,'APPROVED')}>Allow rest-day shift</Button></div></div>)}</section>
}
