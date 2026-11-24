'use client'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, ChevronLeft, ChevronRight, RefreshCw, CalendarDays, Flag, Clock, Search } from 'lucide-react'
import { toast } from 'sonner'
import { AppSpinner } from '@/components/ui/AppSpinner'

import { Button } from '@/components/ui/button'
import { KpiCard } from '@/components/ui/kpi-card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Holiday {
  id: string
  name: string
  date: string
  type: 'REGULAR' | 'SPECIAL_NON_WORKING' | 'SPECIAL_WORKING'
  description: string | null
}

const TYPE_CONFIG = {
  REGULAR: {
    label: 'Regular Holiday',
    bg: '#fee2e2',
    text: '#b91c1c',
    dot: '#ef4444',
    border: '#fca5a5',
  },
  SPECIAL_NON_WORKING: {
    label: 'Special Non-Working',
    bg: '#fef3c7',
    text: '#92400e',
    dot: '#f59e0b',
    border: '#fcd34d',
  },
  SPECIAL_WORKING: {
    label: 'Special Working',
    bg: '#dbeafe',
    text: '#163d78',
    dot: '#0054d7',
    border: '#93c5fd',
  },
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_HEADERS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export function HolidaysTab() {
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    date: '',
    type: 'REGULAR' as Holiday['type'],
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const [selectedDay, setSelectedDay] = useState(today.getDate())
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [error, setError] = useState('')
  const requestVersion = useRef(0)
  const load = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/holidays?year=${year}`)
      const data = await res.json().catch(() => ({}))
      if (version !== requestVersion.current) return
      if (!res.ok) throw new Error(data.error || 'Unable to load holidays')
      setHolidays(data.holidays ?? [])
    } catch (err) {
      if (version === requestVersion.current) setError(err instanceof Error ? err.message : 'Unable to load holidays')
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  function prevMonth() {
    setSelectedDay(1)
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    setSelectedDay(1)
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  async function addHoliday() {
    if (!form.name.trim() || !form.date) { toast.error('Name and date are required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success('Holiday added')
        setShowForm(false)
        setForm({ name: '', date: '', type: 'REGULAR', description: '' })
        const [targetYear, targetMonth, targetDay] = form.date.split('-').map(Number)
        setMonth(targetMonth - 1); setYear(targetYear); setSelectedDay(targetDay)
        if (targetYear === year) void load()
      } else {
        toast.error('Failed to add holiday')
      }
    } catch {
      toast.error('Unable to add holiday. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteHoliday(id: string, name: string) {
    if (!confirm(`Remove "${name}"?`)) return
    try {
      const res = await fetch(`/api/holidays?id=${id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Holiday removed'); void load() }
      else toast.error('Failed to remove holiday')
    } catch {
      toast.error('Unable to remove holiday. Please try again.')
    }
  }

  async function syncFromGoogle() {
    setSyncing(true)
    try {
      const res = await fetch('/api/holidays/sync-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Failed to sync holidays from Google Calendar')
        return
      }
      const sourceLabel = data?.source === 'google_calendar' ? 'Google' : 'Public API'
      toast.success(`${sourceLabel} sync complete: ${data.imported} imported, ${data.skippedManual} skipped`)
      await load()
    } catch {
      toast.error('Unable to sync holidays. Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  // Build calendar cells
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDOW = new Date(year, month, 1).getDay()
  const totalCells = Math.ceil((firstDOW + daysInMonth) / 7) * 7

  const monthHolidays = holidays.filter(h => h.date.slice(0,7) === `${year}-${String(month+1).padStart(2,'0')}`).sort((a,b) => a.date.localeCompare(b.date))
  const visible = monthHolidays.filter(h => (!filterType || h.type === filterType) && h.name.toLowerCase().includes(search.trim().toLowerCase()))
  const onDay = (day: number) => visible.filter(h => Number(h.date.slice(8,10)) === day)
  const selected = onDay(selectedDay)
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const upcoming = holidays.filter(h => h.date.slice(0,10) >= todayKey).sort((a,b) => a.date.localeCompare(b.date))[0]
  const isToday = (day: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
  const fieldClass = 'mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100'

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#c74300]">Plan your year</p><h1 className="text-2xl font-bold text-[#162d54]">Holiday Calendar</h1><p className="mt-1 text-sm text-slate-500">A clear view of public holidays and your company calendar.</p></div>
      <div className="flex flex-wrap gap-2"><PermissionGate permission="settings:write"><Button variant="outline" disabled={syncing || loading} onClick={syncFromGoogle}><RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Syncing...' : 'Sync holidays'}</Button><Button onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />Add holiday</Button></PermissionGate></div>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiCard label="Holidays this month" value={loading || error ? '...' : monthHolidays.length} icon={<CalendarDays />} tone="accent" hint={`${MONTH_NAMES[month]} ${year}`} />
      <KpiCard label="Regular holidays" value={loading || error ? '...' : monthHolidays.filter(h => h.type === 'REGULAR').length} icon={<Flag />} />
      <KpiCard label="Special holidays" value={loading || error ? '...' : monthHolidays.filter(h => h.type !== 'REGULAR').length} icon={<CalendarDays />} />
      <KpiCard label="Next holiday" value={loading || error ? '...' : upcoming ? new Date(upcoming.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'}) : 'None listed'} hint={upcoming?.name ?? `No upcoming holidays in ${year}`} icon={<Clock />} />
    </div>
    <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center">
      <label className="relative flex-1"><span className="sr-only">Search holidays in this month</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search holidays this month" className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm" /></label>
      <select aria-label="Holiday type" value={filterType} onChange={e => setFilterType(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm sm:max-w-64"><option value="">All holiday types</option>{Object.entries(TYPE_CONFIG).map(([key,cfg]) => <option key={key} value={key}>{cfg.label}</option>)}</select>
      <Button variant="outline" onClick={() => { setMonth(today.getMonth());setYear(today.getFullYear());setSelectedDay(today.getDate());setSearch('');setFilterType('') }}>Today</Button>
    </div>
    {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">{error}<Button variant="outline" className="ml-3" onClick={load}>Retry</Button></div> : loading ? <AppSpinner message="Loading holiday calendar..." className="py-16" /> : <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Holiday month calendar">
        <div className="flex items-center justify-between bg-[#162d54] px-4 py-5 sm:px-6"><Button aria-label="Previous month" variant="ghost" onClick={prevMonth} className="text-white hover:bg-white/10 hover:text-white"><ChevronLeft className="h-5 w-5" /></Button><div className="text-center"><h2 className="text-lg font-semibold text-white">{MONTH_NAMES[month]} {year}</h2><p className="mt-1 text-xs text-white/60">Select a date to view details</p></div><Button aria-label="Next month" variant="ghost" onClick={nextMonth} className="text-white hover:bg-white/10 hover:text-white"><ChevronRight className="h-5 w-5" /></Button></div>
        <div className="grid grid-cols-7 bg-slate-50">{DAY_HEADERS.map(d => <div key={d} className="py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{d}</div>)}</div>
        <div className="grid grid-cols-7">{Array.from({length:totalCells},(_,i) => {
          const day=i-firstDOW+1
          if(day<1 || day>daysInMonth) return <div key={i} className="min-h-20 border-t border-r border-slate-100 bg-slate-50/60 sm:min-h-28" />
          const items=onDay(day)
          return <button key={i} type="button" aria-label={`${MONTH_NAMES[month]} ${day}, ${items.length} holidays`} aria-pressed={selectedDay===day} onClick={() => setSelectedDay(day)} className={`min-w-0 min-h-20 border-t border-r border-slate-100 p-1.5 text-left transition-colors hover:bg-orange-50/50 sm:min-h-28 sm:p-2 ${selectedDay===day ? 'bg-orange-50/40 ring-2 ring-inset ring-[#ff5900]' : ''}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${isToday(day) ? 'bg-[#ff5900] text-white' : 'text-[#162d54]'}`}>{day}</span><div className="mt-1 hidden space-y-1 sm:block">{items.slice(0,2).map(h => <span key={h.id} className="block truncate rounded-md px-1.5 py-1 text-[10px] font-semibold" style={{background:TYPE_CONFIG[h.type].bg,color:TYPE_CONFIG[h.type].text}}>{h.name}</span>)}{items.length>2 && <span className="block text-[10px] text-slate-500">+{items.length-2} more</span>}</div><div className="mt-2 flex justify-center gap-1 sm:hidden">{items.slice(0,3).map(h => <span key={h.id} className="h-1.5 w-1.5 rounded-full" style={{background:TYPE_CONFIG[h.type].dot}} />)}</div></button>
        })}</div>
        <div className="flex flex-wrap gap-3 border-t p-4">{Object.entries(TYPE_CONFIG).map(([key,cfg]) => <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600"><span className="h-2 w-2 rounded-full" style={{background:cfg.dot}} />{cfg.label}</span>)}</div>
      </section>
      <aside className="space-y-4">
        <section className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-[#c74300]">Selected date</p><h2 className="mt-2 text-lg font-semibold text-[#162d54]">{MONTH_NAMES[month]} {selectedDay}, {year}</h2><div className="mt-4 space-y-4">{selected.length===0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">No holidays match this date and the current filters.</p> : selected.map(h => <div key={h.id} className="rounded-xl border border-slate-200 p-4"><span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{background:TYPE_CONFIG[h.type].bg,color:TYPE_CONFIG[h.type].text}}>{TYPE_CONFIG[h.type].label}</span><h3 className="mt-3 font-semibold leading-6 text-[#162d54]">{h.name}</h3>{h.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-500">{h.description}</p>}<PermissionGate permission="settings:write"><Button variant="ghost" size="sm" className="mt-3 text-red-600" onClick={() => void deleteHoliday(h.id,h.name)}><Trash2 className="mr-2 h-3.5 w-3.5" />Remove holiday</Button></PermissionGate></div>)}</div></section>
        <section className="rounded-2xl border bg-white p-5"><h2 className="text-sm font-semibold text-[#162d54]">This month <span className="ml-1 text-slate-400">({visible.length})</span></h2><div className="mt-3 max-h-80 space-y-1 overflow-y-auto">{visible.length===0 && <p className="py-3 text-sm text-slate-500">No matching holidays.</p>}{visible.map(h => <button key={h.id} onClick={() => setSelectedDay(Number(h.date.slice(8,10)))} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-orange-50"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-sm font-bold text-[#162d54]">{Number(h.date.slice(8,10))}</span><span className="min-w-0"><span className="block text-sm font-medium text-[#162d54]">{h.name}</span><span className="text-[11px] text-slate-500">{TYPE_CONFIG[h.type].label}</span></span></button>)}</div></section>
      </aside>
    </div>}
    <Dialog open={showForm} onOpenChange={open => { if(!saving) setShowForm(open) }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Add holiday</DialogTitle></DialogHeader><p className="text-sm text-slate-500">Add a date to your company holiday calendar.</p><form onSubmit={e => {e.preventDefault();void addHoliday()}} className="mt-4 space-y-4"><label className="block text-xs font-semibold text-slate-600">Holiday name<input required minLength={2} value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} className={fieldClass} placeholder="e.g. Independence Day" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold text-slate-600">Date<input required type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className={fieldClass} /></label><label className="block text-xs font-semibold text-slate-600">Holiday type<select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value as Holiday['type']}))} className={fieldClass}>{Object.entries(TYPE_CONFIG).map(([key,cfg])=><option key={key} value={key}>{cfg.label}</option>)}</select></label></div><label className="block text-xs font-semibold text-slate-600">Description <span className="font-normal">(optional)</span><textarea rows={3} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} className={`${fieldClass} h-auto py-3`} /></label><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={saving} onClick={()=>setShowForm(false)}>Cancel</Button><PermissionGate permission="settings:write"><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add holiday'}</Button></PermissionGate></div></form></DialogContent></Dialog>
  </div>
}
