"use client"
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { usePermissions } from '@/components/auth/PermissionsProvider'
import { peso } from '@/lib/utils'
type Employee = { id: string; firstName: string; lastName: string; employeeNo: string }
export function ManualCashAdvance({ onCreated }: { onCreated: () => void }) {
  const permissions = usePermissions()
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[search,setSearch]=useState(''),[employees,setEmployees]=useState<Employee[]>([]),[selected,setSelected]=useState<Employee|null>(null)
  const [amount,setAmount]=useState(''),[reason,setReason]=useState(''),[unit,setUnit]=useState('months'),[term,setTerm]=useState('1'),[available,setAvailable]=useState<number|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false)
  useEffect(()=>{if(!open)return;let cancelled=false;setLoading(true);const timer=setTimeout(()=>{fetch('/api/cash-advance/manual-options?q='+encodeURIComponent(search),{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to load employees.');if(!cancelled){setEmployees(d.employees);setError('')}}).catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setLoading(false)})},250);return()=>{cancelled=true;clearTimeout(timer)}},[open,search])
  useEffect(()=>{setAvailable(null);if(!open||!selected)return;let cancelled=false;fetch('/api/cash-advance/manual-options?employeeId='+encodeURIComponent(selected.id),{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to load CA limit.');if(!cancelled){setAvailable(d.limit.available);setError('')}}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[open,selected])
  if (!permissions.includes('loans:write') && !permissions.includes('cashadvance:approve')) return null
  async function save(){if(!selected||busy)return;setBusy(true);setError('');try{const response=await fetch('/api/cash-advance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employeeId:selected.id,amountRequested:Number(amount),reason,repaymentMonths:unit==='months'?Number(term):1,...(unit==='cutoffs'?{repaymentCutoffs:Number(term)}:{})})});const data=await response.json();if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Unable to save cash advance.');toast.success('Cash advance entered and submitted for approval.');setOpen(false);onCreated()}catch(e){setError(e instanceof Error?e.message:'Unable to save.')}finally{setBusy(false)}}
  return <><Button onClick={()=>{setSelected(null);setSearch('');setAmount('');setReason('');setUnit('months');setTerm('1');setError('');setOpen(true)}}><Plus className="h-4 w-4"/>Manual Entry</Button>
    <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value)}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Enter cash advance</DialogTitle><DialogDescription>Create a request on behalf of an employee. Approval is required before payroll deductions begin.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={event=>{event.preventDefault();void save()}}>
        <label className="block text-sm font-medium">Find employee<Input disabled={busy} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or employee number"/></label>
        <label className="block text-sm font-medium">Employee<select required disabled={busy||loading} className="mt-1 min-h-11 w-full rounded-lg border bg-white p-2" value={selected?.id||''} onChange={e=>setSelected(employees.find(employee=>employee.id===e.target.value)||null)}><option value="">{loading?'Loading employees...':'Select an active employee'}</option>{selected&&!employees.some(e=>e.id===selected.id)&&<option value={selected.id}>{selected.lastName}, {selected.firstName} ({selected.employeeNo})</option>}{employees.map(e=><option key={e.id} value={e.id}>{e.lastName}, {e.firstName} ({e.employeeNo})</option>)}</select></label>
        <p className="text-xs text-slate-500">Showing up to 100 matches. Search to find another employee.</p>
        {selected&&<p className="rounded-lg bg-blue-50 p-3 text-sm">{available===null?'Checking available CA limit...':`Available CA limit: ${peso(available)}`}</p>}
        <label className="block text-sm font-medium">Amount (PHP)<Input required disabled={busy} type="number" min="0.01" max={available??undefined} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Repayment basis<select disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border bg-white p-2" value={unit} onChange={e=>setUnit(e.target.value)}><option value="months">Months</option><option value="cutoffs">Payroll cutoffs</option></select></label><label className="text-sm font-medium">Duration<select disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border bg-white p-2" value={term} onChange={e=>setTerm(e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} {unit}</option>)}</select></label></div>
        <label className="block text-sm font-medium">Reason / notes<textarea required minLength={3} maxLength={500} disabled={busy} className="mt-1 w-full rounded-lg border p-3" rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <p className="text-xs text-slate-500">The existing 30% income limit, outstanding balance, and pending-request checks apply. This records a request; it does not transfer funds.</p>
        {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-center gap-3"><Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy||!selected||available===null||Number(amount)<=0||Number(amount)>available||reason.trim().length<3}>{busy?'Saving...':'Submit for approval'}</Button></div>
      </form>
    </DialogContent></Dialog></>
}
