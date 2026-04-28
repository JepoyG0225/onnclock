'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { MapPin, Users, RefreshCw, Clock, Monitor } from 'lucide-react'
import dynamic from 'next/dynamic'

const LiveMapInner = dynamic(() => import('@/components/map/LiveMapInner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100 rounded-xl">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#2E4156] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-500">Loading map...</p>
      </div>
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
  { bg: '#ecfeff', text: '#0f766e', border: '#99f6e4' },
  { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  { bg: '#f5f3ff', text: '#6d28d9', border: '#c4b5fd' },
  { bg: '#fff7ed', text: '#c2410c', border: '#fdba74' },
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
      setLocations(data.locations ?? [])
      setLastUpdated(new Date())
    } catch {
      // silent fail
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
  const withLocation = locations.filter(l => l.lastPing !== null)

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#2E4156]" /> Live Attendance Map
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Real-time GPS tracking — <span suppressHydrationWarning>{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-[#2E4156] font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2E4156] animate-pulse" />
              {clockedIn.length} clocked in
            </span>
          </div>
          <button
            onClick={() => { fetchLocations(); fetchScreenshots() }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {lastUpdated && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {format(lastUpdated, 'hh:mm:ss a')}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — employee list */}
        <aside className="w-72 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-2">
              Today&apos;s Attendance ({locations.length})
            </p>

            {loading && locations.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg mb-2 animate-pulse" />
              ))
            ) : locations.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No employees tracked today</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {clockedIn.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-[#2E4156] px-1 mt-3 mb-1">Clocked In ({clockedIn.length})</p>
                    {clockedIn.map(loc => (
                      <EmployeeCard
                        key={loc.employeeId}
                        loc={loc}
                        capture={latestCaptures[loc.employeeId] ?? null}
                        onSelect={(id) => setSelectedEmployeeId(id)}
                        onActionDone={fetchLocations}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Map */}
        <div className="flex-1 relative">
          {withLocation.length === 0 && !loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 font-medium">No GPS data yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Employees must clock in via the portal with location enabled
                </p>
              </div>
            </div>
          ) : (
            <LiveMapInner
              locations={locations}
              latestCaptures={latestCaptures}
              selectedEmployeeId={selectedEmployeeId}
              onSelectEmployee={(id) => setSelectedEmployeeId(id)}
            />
          )}
        </div>
      </div>

    </div>
  )
}

function EmployeeCard({
  loc,
  capture,
  onSelect,
  onActionDone,
}: {
  loc: EmployeeLocation
  capture: LatestCapture | null
  onSelect: (id: string) => void
  onActionDone: () => void
}) {
  const [actioning, setActioning] = useState<'end-break' | 'clock-out' | null>(null)
  const positionTitle = loc.employee.position?.title ?? null
  const positionStyle = getPositionBadgeStyle(positionTitle)
  const fullName = `${loc.employee.firstName} ${loc.employee.lastName}`

  async function handleAction(action: 'end-break' | 'clock-out') {
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
      className={`rounded-lg border text-sm transition-shadow ${
        loc.isClockedIn ? 'bg-[#D4D8DD] border-[#C0C8CA]' : 'bg-gray-50 border-gray-100'
      }`}
    >
      <div className="p-3 cursor-pointer hover:opacity-90" onClick={() => onSelect(loc.employeeId)}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate">{fullName}</p>
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
              <Monitor className="w-3.5 h-3.5 text-[#2E4156] opacity-70" aria-label="Screenshot available" />
            )}
            {loc.isOnBreak && (
              <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">BREAK</span>
            )}
            <span className={`w-2.5 h-2.5 rounded-full ${
              loc.isClockedIn ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
            }`} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1.5">
          {loc.clockInTime && (
            <span>In: {format(new Date(loc.clockInTime), 'hh:mm a')}</span>
          )}
          {loc.clockOutTime && (
            <span>Out: {format(new Date(loc.clockOutTime), 'hh:mm a')}</span>
          )}
          {!loc.lastPing && <span className="text-amber-500">No GPS data</span>}
        </div>
      </div>

      {/* Admin action buttons — only shown when employee is clocked in */}
      {loc.isClockedIn && (
        <div className="px-3 pb-2.5 flex gap-1.5">
          {loc.isOnBreak && (
            <button
              disabled={!!actioning}
              onClick={() => handleAction('end-break')}
              className="flex-1 text-[10px] font-semibold py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50"
            >
              {actioning === 'end-break' ? 'Ending…' : 'End Break'}
            </button>
          )}
          <button
            disabled={!!actioning}
            onClick={() => handleAction('clock-out')}
            className="flex-1 text-[10px] font-semibold py-1 rounded-md bg-red-500 hover:bg-red-600 text-white transition disabled:opacity-50"
          >
            {actioning === 'clock-out' ? 'Clocking out…' : 'Clock Out'}
          </button>
        </div>
      )}
    </div>
  )
}



