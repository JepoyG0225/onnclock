"use client"
import {useState,useRef} from 'react'
import {MessageCircle,Loader2} from 'lucide-react'
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {toast} from 'sonner'
export function PayslipQuestion({payslipId,item,period,amount}:{payslipId:string;item:string;period:string;amount:number}){
 const [open,setOpen]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[ticket,setTicket]=useState('');const key=useRef('')
 async function send(){setBusy(true);try{const r=await fetch('/api/hr-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:key.current,payslipId,payslipItem:item,payslipAmount:amount,category:'Payroll Clarification',subject:`${item} - ${period}`.slice(0,150),description:message})});const d=await r.json();if(!r.ok)throw Error(d.error);setTicket(d.request.id);toast.success('Question sent to HR')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <><button type="button" className="ml-2 rounded-lg p-1.5 text-[#0054d7] hover:bg-blue-50" title={`Question ${item}`} aria-label={`Question ${item}`} onClick={()=>{key.current=crypto.randomUUID();setTicket('');setMessage('');setOpen(true)}}><MessageCircle size={15}/></button><Dialog open={open} onOpenChange={v=>!busy&&setOpen(v)}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Question this amount</DialogTitle></DialogHeader><p className="text-sm text-slate-500">{item} - {period}</p>{ticket?<div className="rounded-xl bg-blue-50 p-4 text-sm">Your question is linked to this payslip. <a className="text-[#0054d7] underline" href={`/portal/hr-requests?request=${ticket}`}>Open HR conversation</a></div>:<><label className="text-sm">What would you like HR to check?<textarea value={message} onChange={e=>setMessage(e.target.value)} className="mt-2 w-full rounded-xl border p-3" rows={4} maxLength={5000}/></label><Button onClick={send} disabled={busy||message.trim().length<5}>{busy&&<Loader2 className="animate-spin" size={16}/>}Send question</Button></>}</DialogContent></Dialog></>
}
