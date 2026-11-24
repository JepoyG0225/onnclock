'use client'
import { BulkEncashmentForm, type EncashmentBalance } from './BulkEncashmentForm'
import { KpiCard } from '@/components/ui/kpi-card'
import { AppSpinner } from '@/components/ui/AppSpinner'


import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { usePermissions } from '@/components/auth/PermissionsProvider'
import { statusToBadgeVariant, formatStatusLabel } from '@/lib/status'
import { ArrowLeft, ArrowRight, CalendarDays, Wallet, Layers, Search, RefreshCw, ChevronDown, Info, Loader2, ReceiptText } from 'lucide-react' 

type Balance = EncashmentBalance
type Entry = { id: string; days: string; dailyRate: string; amount: string; status: string; reason: string;
  balance: { employee: { firstName: string; lastName: string }; leaveType: { name: string } }; payrollRun: { id: string; periodLabel: string; status: string; runType?: string } }
const money = (v: number | string) => Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function LeaveEncashmentsForm({ initialYear, initialBalanceId }: { initialYear: number; initialBalanceId: string }) {
  const canEdit = usePermissions().includes('payroll:write')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [cancelEntry, setCancelEntry] = useState<Entry | null>(null)
  const [loadError, setLoadError] = useState('')
  const loadSequence = useRef(0)
  const [year, setYear] = useState(initialYear)
  const [balances, setBalances] = useState<Balance[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true); setLoadError('')
    try {
      const res = await fetch(`/api/leaves/encashments?year=${year}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (sequence !== loadSequence.current) return
      setBalances(data.balances); setEntries(data.entries)

    } catch (err) { if (sequence === loadSequence.current) setLoadError(err instanceof Error ? err.message : 'Unable to load encashments') }
    finally { if (sequence === loadSequence.current) setLoading(false) }
  }, [year, initialBalanceId])
  useEffect(() => { void load() }, [load])

  async function cancel(id: string) {
    if (!canEdit || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/leaves/encashments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(cancelEntry?.payrollRun.runType==='LEAVE_ENCASHMENT'?'Batch cancelled; all leave credits restored.':'Encashment cancelled; days restored. Recompute payroll before approval.')
      setCancelEntry(null)
      await load()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Unable to cancel') }
    finally { setSaving(false) }
  }
  const input = 'mt-1.5 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/15 disabled:opacity-60'
  const filtered = entries.filter(e => (statusFilter === 'ALL' || e.status === statusFilter) && `${e.balance.employee.firstName} ${e.balance.employee.lastName} ${e.balance.leaveType.name} ${e.payrollRun.periodLabel} ${e.reason}`.toLowerCase().includes(search.toLowerCase()))
  const canCancel = (e: Entry) => canEdit && e.status === 'APPROVED' && ['DRAFT', 'COMPUTED'].includes(e.payrollRun.status)
  const stats = [
    { label: 'Eligible balances', value: balances.filter(b => b.available > 0).length, icon: Layers },
    { label: 'Available days', value: Number(balances.reduce((n,b) => n+b.available,0).toFixed(2)), icon: CalendarDays },
    { label: 'Eligible employees', value: new Set(balances.filter(b=>b.available>0).map(b=>b.employeeId)).size, icon: ReceiptText },
    { label: 'Approved in loaded history', value: `₱${money(entries.filter(e => e.status === 'APPROVED').reduce((n,e) => n+Number(e.amount),0))}`, icon: Wallet },
  ]
  return <div className="w-full min-w-0 space-y-6">
    <Link href={`/leaves/credits?year=${year}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-primary"><ArrowLeft className="h-4 w-4"/>Leave credits</Link>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-primary">Leave encashment</h1><p className="mt-1 text-sm text-slate-500">Convert eligible leave credits into payroll income.</p></div><div className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:w-auto">
      <label className="relative flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 focus-within:ring-2 focus-within:ring-accent sm:min-w-40">
        <CalendarDays className="h-5 w-5 shrink-0 text-accent" aria-hidden="true"/>
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Leave year</span><select aria-label="Leave year" className="block w-full appearance-none border-0 bg-transparent pr-6 text-sm font-semibold text-primary outline-none disabled:cursor-not-allowed disabled:opacity-50" value={year} disabled={saving} onChange={e => { setYear(Number(e.target.value)); setCancelEntry(null) }}>{Array.from({length:201},(_,i)=>2000+i).map(y=><option key={y}>{y}</option>)}</select></span>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500" aria-hidden="true"/>
      </label>
      <Button type="button" variant="outline" className="h-12 shrink-0 gap-2 rounded-xl border-orange-200 bg-orange-50 px-4 text-primary hover:bg-orange-100" aria-label="Refresh encashments" disabled={loading||saving} onClick={()=>void load()}><RefreshCw aria-hidden="true" className={`h-4 w-4 text-accent ${loading?'animate-spin motion-reduce:animate-none':''}`}/><span>{loading?'Refreshing...':'Refresh'}</span></Button>
    </div></div>
    {loadError&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError} <button className="ml-2 font-semibold underline" onClick={()=>void load()}>Try again</button></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(stat=><KpiCard key={stat.label} label={stat.label} value={loading||loadError?'-':stat.value} icon={<stat.icon className="h-4 w-4"/>} tone={stat.icon===Wallet?'accent':'primary'}/>)}</div>
    {canEdit ? (!loading&&<BulkEncashmentForm key={year} year={year} balances={balances} initialBalanceId={initialBalanceId} loading={loading} disabled={!!loadError} onBusyChange={setSaving}/>) : <p className="rounded-xl border bg-white p-4 text-sm text-slate-500">View-only access. Payroll write permission is required to approve or cancel an encashment.</p>}
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4 border-b p-5"><div><h2 className="font-semibold text-primary">Conversion history</h2><p className="mt-1 text-xs text-slate-500">{filtered.length} of {entries.length} records · Latest 200 for {year}</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400"/><input aria-label="Search conversion history" className={`${input} mt-0 pl-9`} placeholder="Search employee or payroll" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Filter encashment status" className={`${input} mt-0 sm:w-40`} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All statuses</option><option value="APPROVED">Approved</option><option value="CANCELLED">Cancelled</option></select></div></div>
      {loading?<AppSpinner size="md" message="Loading encashments..." className="py-10" />:loadError?<p className="p-10 text-center text-sm text-slate-500">History could not be loaded. Try refreshing.</p>:!filtered.length?<div className="p-10 text-center"><ReceiptText className="mx-auto mb-3 h-8 w-8 text-slate-300"/><p className="font-medium text-primary">{entries.length?'No matching conversions':'No conversions yet'}</p><p className="mt-1 text-sm text-slate-500">{entries.length?'Try a different search or status.':'Approved leave conversions will appear here.'}</p></div>:<>
      <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Employee / leave','Payroll','Days × rate','Amount','Status','Action'].map(h=><th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{filtered.map(e=><tr key={e.id} className="border-t hover:bg-slate-50/60"><td className="max-w-xs px-5 py-4"><p className="font-semibold text-primary">{e.balance.employee.firstName} {e.balance.employee.lastName}</p><p className="mt-1 text-xs text-slate-500">{e.balance.leaveType.name}</p><p className="mt-1 break-words text-xs text-slate-400">{e.reason}</p></td><td className="px-5 py-4 text-xs"><Link className="text-secondary underline" href={`/payroll/${e.payrollRun.id}`}>{e.payrollRun.periodLabel}</Link></td><td className="whitespace-nowrap px-5 py-4 text-xs">{Number(e.days)} × ₱{money(e.dailyRate)}</td><td className="whitespace-nowrap px-5 py-4 font-semibold text-primary">₱{money(e.amount)}</td><td className="px-5 py-4"><Badge variant={statusToBadgeVariant(e.status)}>{formatStatusLabel(e.status)}</Badge></td><td className="px-5 py-4">{canCancel(e)?<Button variant="ghost" size="sm" className="text-red-600" disabled={saving} onClick={()=>setCancelEntry(e)}>{e.payrollRun.runType==='LEAVE_ENCASHMENT'?'Cancel batch':'Cancel'}</Button>:<span className="text-slate-400">-</span>}</td></tr>)}</tbody></table></div>
      <div className="divide-y md:hidden">{filtered.map(e=><article key={e.id} className="space-y-3 p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-primary">{e.balance.employee.firstName} {e.balance.employee.lastName}</h3><p className="mt-1 text-xs text-slate-500">{e.balance.leaveType.name}</p></div><Badge variant={statusToBadgeVariant(e.status)}>{formatStatusLabel(e.status)}</Badge></div><p className="text-xs text-slate-500">{e.payrollRun.periodLabel}</p><div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><span className="text-xs">{Number(e.days)} days × ₱{money(e.dailyRate)}</span><strong className="text-primary">₱{money(e.amount)}</strong></div><p className="break-words text-xs text-slate-500">{e.reason}</p>{canCancel(e)&&<Button variant="outline" size="sm" className="w-full text-red-600" disabled={saving} onClick={()=>setCancelEntry(e)}>{e.payrollRun.runType==='LEAVE_ENCASHMENT'?'Cancel entire batch':'Cancel conversion'}</Button>}</article>)}</div></>}
    </section>
    <Dialog open={!!cancelEntry} onOpenChange={open=>{if(!open&&!saving)setCancelEntry(null)}}><DialogContent><div role="dialog" aria-modal="true" aria-label="Cancel conversion"><DialogHeader><DialogTitle>Cancel conversion?</DialogTitle><DialogDescription>{cancelEntry?.payrollRun.runType==='LEAVE_ENCASHMENT'?'This cancels the ENTIRE generated batch, removes its unpaid payslips, and restores all selected employees’ leave credits. The cancelled payroll remains in history for audit.':`This restores ${cancelEntry?.days} leave days. Recompute the linked payroll before approval.`}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={saving} onClick={()=>setCancelEntry(null)}>Keep conversion</Button><Button variant="destructive" disabled={saving} onClick={()=>cancelEntry&&void cancel(cancelEntry.id)}>{saving?'Cancelling...':cancelEntry?.payrollRun.runType==='LEAVE_ENCASHMENT'?'Cancel entire batch':'Cancel conversion'}</Button></DialogFooter></div></DialogContent></Dialog>
  </div>
}
