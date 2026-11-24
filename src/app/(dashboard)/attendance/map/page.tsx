'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { MapPin, Users, RefreshCw, Clock, Monitor, Search, Coffee, LocateFixed, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KpiCard } from '@/components/ui/kpi-card'
import dynamic from 'next/dynamic'
import { AppSpinner } from '@/components/ui/AppSpinner'

const LiveMapInner = dynamic(() => import('@/components/map/LiveMapInner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100 rounded-xl">
      <AppSpinner size="md" message="Loading map…" />
    </div>
  ),
})

interface EmployeeLocation {
  employeeId: string
  dtrId?: string
  employee: {
    firstName: string
    lastName: string
    employeeNo: string
    department: { name: string } | null
    position: { title: string } | null
  }
  clockInTime: string | null
  clockOutTime: string | null
  breakIn?: string | null
  breakOut?: string | null
  isOnBreak?: boolean
  clockInAddress: string | null
  clockInPhoto?: string | null
  isClockedIn: boolean
  lastPing: {
    lat: number
    lng: number
    accuracy: number | null
    recordedAt: string
  } | null
}

interface LatestCapture {
  id: string
  imageDataUrl: string
  capturedAt: string
}

const POSITION_BADGE_PALETTE = [
  { bg: '#ecfeff', text: '#646568', border: '#99f6e4' },
  { bg: '#eff6ff', text: '#0044ad', border: '#93c5fd' },
  { bg: '#f5f3ff', text: '#6d28d9', border: '#c4b5fd' },
  { bg: '#f7f7f7', text: '#343434', border: '#d4d4d4' },
  { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
  { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
]

function getPositionBadgeStyle(title?: string | null) {
  if (!title) return null
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  }
  return POSITION_BADGE_PALETTE[hash % POSITION_BADGE_PALETTE.length]
}

function resolveWsBaseUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_WS_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  if (typeof window === 'undefined') return null
  const host = window.location.hostname.toLowerCase()
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  if (!isLocal) return null
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}`
}

export default function AttendanceMapPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [department, setDepartment] = useState('all')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [mapVersion, setMapVersion] = useState(0)
  const [locations, setLocations] = useState<EmployeeLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  // employeeId → latest screenshot
  const [latestCaptures, setLatestCaptures] = useState<Record<string, LatestCapture>>({})

  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch('/api/locations?clockedInOnly=1')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to load attendance locations.')
      setError('')
      setLocations(data.locations ?? [])
      setLastUpdated(new Date())
    } catch {
      setError('Unable to refresh locations. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchScreenshots = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance/screen-captures/latest')
      if (!res.ok) return
      const data = await res.json().catch(() => ({}))
      if (data.captures) setLatestCaptures(data.captures)
    } catch {
      // silent — screenshot feature may not be enabled
    }
  }, [])

  useEffect(() => {
    fetchLocations()
    const interval = setInterval(fetchLocations, 15_000)
    return () => clearInterval(interval)
  }, [fetchLocations])

  // Poll screenshots every 2 minutes — slightly offset from location poll
  useEffect(() => {
    fetchScreenshots()
    const interval = setInterval(fetchScreenshots, 120_000)
    return () => clearInterval(interval)
  }, [fetchScreenshots])

  useEffect(() => {
    let active = true
    async function loadCompany() {
      try {
        const res = await fetch('/api/settings')
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        if (active) setCompanyId(data.id ?? null)
      } catch { /* ignore */ }
    }
    loadCompany()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!companyId) return
    const wsBase = resolveWsBaseUrl()
    if (!wsBase) return
    const wsUrl = `${wsBase}/ws?companyId=${encodeURIComponent(companyId)}`
    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg?.type !== 'location_update' || !msg.location) return
        const loc = msg.location as EmployeeLocation
        setLocations(prev => {
          if (!loc.isClockedIn) {
            return prev.filter(p => p.employeeId !== loc.employeeId)
          }
          const idx = prev.findIndex(p => p.employeeId === loc.employeeId)
          if (idx === -1) return [loc, ...prev]
          const next = [...prev]
          next[idx] = { ...next[idx], ...loc }
          return next
        })
        setLastUpdated(new Date())
      } catch {
        // ignore malformed
      }
    }

    return () => {
      ws.close()
    }
  }, [companyId])

  const clockedIn = locations.filter(l => l.isClockedIn)
  const departments = [...new Set(clockedIn.map(l=>l.employee.department?.name).filter((name):name is string=>!!name))].sort()
  const filtered = clockedIn.filter(l=>`${l.employee.firstName} ${l.employee.lastName} ${l.employee.employeeNo}`.toLowerCase().includes(search.trim().toLowerCase()) && (department==='all'||l.employee.department?.name===department) && (status==='all'||(status==='break'?l.isOnBreak:status==='missing'?!l.lastPing:!l.isOnBreak)))
  const withLocation = filtered.filter(l=>l.lastPing)
  async function refresh(){setRefreshing(true);try{await Promise.all([fetchLocations(),fetchScreenshots()])}finally{setRefreshing(false)}}
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-primary">Live Attendance Map</h1><p className="mt-1 text-sm text-slate-500">See clocked-in employees and their latest reported locations.</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{lastUpdated?'Updated '+format(lastUpdated,'h:mm:ss a'):'Waiting for locations'}</span><Button variant="outline" disabled={loading||refreshing} onClick={()=>void refresh()}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing?'animate-spin motion-reduce:animate-none':''}`}/>Refresh</Button></div></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard label="Clocked in" value={loading?'?':clockedIn.length} icon={<Users className="h-4 w-4"/>} hint="Current attendance sessions"/>
      <KpiCard label="Working" value={loading?'?':clockedIn.filter(l=>!l.isOnBreak).length} icon={<Clock className="h-4 w-4"/>} hint="Clocked in, not on break" tone="accent"/>
      <KpiCard label="On break" value={loading?'?':clockedIn.filter(l=>l.isOnBreak).length} icon={<Coffee className="h-4 w-4"/>} hint="Currently taking a break"/>
      <KpiCard label="With location" value={loading?'?':clockedIn.filter(l=>l.lastPing).length} icon={<MapPin className="h-4 w-4"/>} hint={`${clockedIn.filter(l=>!l.lastPing).length} without GPS data`} tone="accent"/>
    </div>
    {error&&<div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0"/>{error} {locations.length>0&&'Showing the last loaded data.'}</div>}
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input aria-label="Search employees" placeholder="Search name or employee number" value={search} onChange={e=>{setSearch(e.target.value);setSelectedEmployeeId(null)}} className="h-10 w-full rounded-xl border bg-slate-50 pl-9 pr-3 text-sm"/></div>
        <select aria-label="Department" value={department} onChange={e=>{setDepartment(e.target.value);setSelectedEmployeeId(null)}} className="h-10 max-w-full rounded-xl border bg-white px-3 text-sm"><option value="all">All departments</option>{departments.map(name=><option key={name}>{name}</option>)}</select>
        <select aria-label="Attendance status" value={status} onChange={e=>{setStatus(e.target.value);setSelectedEmployeeId(null)}} className="h-10 rounded-xl border bg-white px-3 text-sm"><option value="all">All clocked in</option><option value="working">Working</option><option value="break">On break</option><option value="missing">No GPS data</option></select>
        <span className="text-xs text-slate-500 sm:ml-auto">Auto-refresh every 15 seconds</span>
      </div>
      <div className="flex flex-col lg:h-[640px] lg:flex-row">
        <aside className="order-2 max-h-[480px] overflow-y-auto border-t bg-slate-50/50 lg:order-1 lg:max-h-none lg:w-80 lg:shrink-0 lg:border-r lg:border-t-0">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3"><h2 className="text-sm font-semibold text-primary">Employees</h2><span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-primary">{filtered.length}</span></div>
          <div className="space-y-3 p-3">{loading?<AppSpinner className="py-12" message="Loading attendance..."/>:filtered.length===0?<div className="px-3 py-10 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-slate-300"/><p className="text-sm font-medium text-primary">{clockedIn.length?'No matching employees':'No employees clocked in'}</p><p className="mt-1 text-xs text-slate-500">{clockedIn.length?'Try another search or filter.':'Active attendance sessions will appear here.'}</p></div>:filtered.map(loc=><EmployeeCard key={loc.employeeId} loc={loc} selected={selectedEmployeeId===loc.employeeId} capture={latestCaptures[loc.employeeId]??null} onSelect={setSelectedEmployeeId} onActionDone={fetchLocations}/>)}</div>
        </aside>
        <div className="relative isolate order-1 h-[420px] min-w-0 flex-none overflow-hidden bg-slate-50 lg:order-2 lg:h-full lg:flex-1">
          {loading?<AppSpinner className="h-full" message="Loading locations..."/>:withLocation.length===0?<div className="flex h-full items-center justify-center p-6 text-center"><div><MapPin className="mx-auto mb-4 h-10 w-10 text-accent"/><h2 className="font-semibold text-primary">{filtered.length?'No GPS data available':'No locations to display'}</h2><p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">{filtered.length?'Employees need to enable location access when clocking in.':'Clocked-in employees with GPS data appear here. Check your filters if employees are missing.'}</p></div></div>:<><LiveMapInner fitVersion={mapVersion} locations={filtered} latestCaptures={latestCaptures} selectedEmployeeId={selectedEmployeeId} onSelectEmployee={setSelectedEmployeeId}/><button type="button" onClick={()=>{setSelectedEmployeeId(null);setMapVersion(v=>v+1)}} className="absolute right-3 top-3 z-[500] flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-primary shadow-sm"><LocateFixed className="h-4 w-4 text-accent"/>Fit locations</button><div className="pointer-events-none absolute bottom-6 left-3 z-[500] rounded-lg bg-white/95 px-3 py-2 text-xs text-primary shadow-sm">{withLocation.length} locations shown</div></>}
        </div>
      </div>
    </section>
    <p className="text-xs leading-5 text-slate-500">Locations reflect the latest device report and may be delayed. Select an employee to view their location, report time, and available screenshot.</p>
  </div>
}

function EmployeeCard({
  loc,
  capture,
  selected,
  onSelect,
  onActionDone,
}: {
  loc: EmployeeLocation
  capture: LatestCapture | null
  selected: boolean
  onSelect: (id: string) => void
  onActionDone: () => void
}) {
  const [actioning, setActioning] = useState<'end-break' | 'clock-out' | null>(null)
  const [confirming, setConfirming] = useState<'end-break' | 'clock-out' | null>(null)
  const positionTitle = loc.employee.position?.title ?? null
  const positionStyle = getPositionBadgeStyle(positionTitle)
  const fullName = `${loc.employee.firstName} ${loc.employee.lastName}`

  async function handleAction(action: 'end-break' | 'clock-out') {
    setConfirming(null)
    setActioning(action)
    try {
      const res = await fetch('/api/attendance/admin-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: loc.employeeId, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data?.error ?? 'Action failed')
        return
      }
      onActionDone()
    } catch {
      alert('Failed to perform action. Please try again.')
    } finally {
      setActioning(null)
    }
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border text-sm transition-shadow ${
        selected ? 'bg-orange-50/50 border-orange-300 shadow-sm' : 'bg-white border-slate-200 hover:border-orange-200'
      }`}
    >
      <button type="button" aria-pressed={selected} className="w-full p-3 text-left hover:bg-orange-50/30" onClick={() => onSelect(loc.employeeId)}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-primary truncate">{fullName}</p>
            {positionTitle && positionStyle && (
              <span
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold mt-1"
                style={{ background: positionStyle.bg, color: positionStyle.text, borderColor: positionStyle.border }}
              >
                {positionTitle}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {capture && (
              <Monitor className="w-3.5 h-3.5 text-[var(--brand-primary)] opacity-70" aria-label="Screenshot available" />
            )}
            {loc.isOnBreak && (
              <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">BREAK</span>
            )}
            <span className={`w-2.5 h-2.5 rounded-full ${
              loc.isClockedIn ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
            }`} />
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">{loc.employee.employeeNo}{loc.employee.department?.name ? ` / ${loc.employee.department.name}` : ''}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-2">
          {loc.clockInTime && (
            <span>In: {format(new Date(loc.clockInTime), 'hh:mm a')}</span>
          )}
          {loc.clockOutTime && (
            <span>Out: {format(new Date(loc.clockOutTime), 'hh:mm a')}</span>
          )}
          {loc.lastPing && <span>GPS: {format(new Date(loc.lastPing.recordedAt), 'h:mm a')}</span>}
          {!loc.lastPing && <span className="text-amber-500">No GPS data</span>}
        </div>
      </button>

      {/* Admin action buttons — only shown when employee is clocked in */}
      {loc.isClockedIn && (
        <div className="px-3 pb-2.5">
          {/* Inline confirmation prompt */}
          {confirming ? (
            <div className="rounded-md bg-white border border-gray-300 px-2.5 py-2">
              <p className="text-[10px] font-semibold text-gray-700 mb-1.5 leading-snug">
                {confirming === 'clock-out'
                  ? `Clock out ${loc.employee.firstName}?`
                  : `End break for ${loc.employee.firstName}?`}
              </p>
              <div className="flex gap-1.5">
                <button
                  disabled={!!actioning}
                  onClick={() => handleAction(confirming)}
                  className={`flex-1 text-[10px] font-bold py-1 rounded-md text-white transition disabled:opacity-50 ${
                    confirming === 'clock-out'
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-amber-500 hover:bg-amber-600'
                  }`}
                >
                  {actioning ? (confirming === 'clock-out' ? 'Clocking out…' : 'Ending…') : 'Confirm'}
                </button>
                <button
                  disabled={!!actioning}
                  onClick={() => setConfirming(null)}
                  className="flex-1 text-xs font-semibold py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5">
              {loc.isOnBreak && (
                <button
                  disabled={!!actioning}
                  onClick={() => setConfirming('end-break')}
                  className="flex-1 text-xs font-semibold py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50"
                >
                  End Break
                </button>
              )}
              <button
                disabled={!!actioning}
                onClick={() => setConfirming('clock-out')}
                className="flex-1 text-xs font-semibold py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition disabled:opacity-50"
              >
                Clock Out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}



