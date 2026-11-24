'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarDays, Users, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { KpiCard } from '@/components/ui/kpi-card'
import { getStatusColor } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { AppSpinner } from '@/components/ui/AppSpinner'

type Leave = {
  id: string
  startDate: string
  endDate: string
  totalDays: number | null
  status: 'APPROVED' | 'PENDING'
  reason: string | null
  employee: {
    id: string
    firstName: string
    lastName: string
    employeeNo: string
    department: { id: string; name: string } | null
  }
  leaveType: { name: string; code: string; isWithPay: boolean }
}
type Dept = { id: string; name: string }

const TYPE_COLORS: Record<string, string> = {
  VL: 'bg-blue-50 text-blue-700 border-blue-200',
  SL: 'bg-rose-50 text-rose-700 border-rose-200',
  EL: 'bg-purple-50 text-purple-700 border-purple-200',
  ML: 'bg-pink-50 text-pink-700 border-pink-200',
  PL: 'bg-amber-50 text-amber-700 border-amber-200',
}
function typeColor(code: string) {
  return TYPE_COLORS[code] ?? 'bg-slate-50 text-slate-700 border-slate-200'
}

export default function LeaveCalendarPage() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [filterDept, setFilterDept] = useState('')
  const [includePending, setIncludePending] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)

  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  // Calendar grid: full weeks (Mon-Sun)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const qs = new URLSearchParams({
          from: format(gridStart, 'yyyy-MM-dd'),
          to: format(gridEnd, 'yyyy-MM-dd'),
        })
        if (filterDept) qs.set('departmentId', filterDept)
        if (includePending) qs.set('includePending', '1')
        const res = await fetch(`/api/leaves/calendar?${qs.toString()}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          throw new Error(data.error ?? 'Unable to load the team calendar')
        }
        setLeaves(data.leaves ?? [])
        setDepts(data.departments ?? [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load the team calendar')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
    // gridStart/gridEnd change with cursor; filterDept + includePending too
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, filterDept, includePending, refresh])

  // Build days array for the grid
  const days = useMemo(() => {
    const arr: Date[] = []
    let d = gridStart
    while (d <= gridEnd) { arr.push(d); d = addDays(d, 1) }
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor])

  // For each day, find leaves that overlap it.
  function leavesOnDay(day: Date): Leave[] {
    const dayStr = format(day, 'yyyy-MM-dd')
    return leaves.filter((l) => {
      const startDate = l.startDate.slice(0, 10)
      const endDate = l.endDate.slice(0, 10)
      return dayStr >= startDate && dayStr <= endDate
    })
  }

  // Conflict warning: 3+ employees from same department off on the same day.
  function deptConflictCount(day: Date): number {
    const onDay = leavesOnDay(day)
    const byDept = new Map<string, Set<string>>()
    for (const l of onDay) {
      const d = l.employee.department?.id
      if (!d || l.status !== 'APPROVED') continue
      const employees = byDept.get(d) ?? new Set<string>()
      employees.add(l.employee.id)
      byDept.set(d, employees)
    }
    return Math.max(0, ...Array.from(byDept.values(), employees => employees.size)) // largest dept on this day
  }

  const monthLeaves = leaves.filter(l => l.startDate.slice(0,10) <= format(monthEnd, 'yyyy-MM-dd') && l.endDate.slice(0,10) >= format(monthStart, 'yyyy-MM-dd'))
  const selectedLeaves = leavesOnDay(new Date(`${selectedDate}T12:00:00`))
  function changeMonth(next: Date) { setCursor(startOfMonth(next)); setSelectedDate(format(startOfMonth(next), 'yyyy-MM-dd')) }
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-[#ff5900]" />
            Team Calendar
          </h1>
          <p className="text-gray-500 text-sm mt-1">Who&apos;s out this month — for coverage planning and conflict spotting.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Approved requests" value={loading || error ? '...' : monthLeaves.filter(l => l.status === 'APPROVED').length} icon={<CalendarDays />} tone="accent" />
        <KpiCard label="Employees on leave" value={loading || error ? '...' : new Set(monthLeaves.filter(l => l.status === 'APPROVED').map(l => l.employee.id)).size} icon={<Users />} />
        <KpiCard label="Pending requests" value={loading || error ? '...' : includePending ? monthLeaves.filter(l => l.status === 'PENDING').length : 'Hidden'} hint="Enable Include pending to view" icon={<CalendarDays />} />
        <KpiCard label="Coverage risk days" value={loading || error ? '...' : days.filter(d => isSameMonth(d,cursor) && deptConflictCount(d)>=3).length} hint="3+ approved employees in one department" icon={<AlertTriangle />} tone="warning" />
      </div>
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Button aria-label="Previous month" variant="outline" size="sm" onClick={() => changeMonth(subMonths(cursor, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-bold text-lg min-w-[145px] text-center">{format(cursor, 'MMMM yyyy')}</div>
          <Button aria-label="Next month" variant="outline" size="sm" onClick={() => changeMonth(addMonths(cursor, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setCursor(startOfMonth(new Date())); setSelectedDate(todayStr) }}>
            Today
          </Button>

          {depts.length > 0 && (
            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
              <label htmlFor="calendar-department" className="text-xs font-medium text-gray-600">Department</label>
              <select
                id="calendar-department"
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm bg-white"
              >
                <option value="">All</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includePending}
              onChange={(e) => setIncludePending(e.target.checked)}
              className="h-4 w-4 accent-[#ff5900]"
            />
            Include pending
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            {monthLeaves.length} {includePending ? 'leave request' : 'approved leave'}{monthLeaves.length !== 1 ? 's' : ''} overlapping this month
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? <div role="alert" className="p-6 text-sm text-red-700">{error}<Button variant="outline" className="ml-3" onClick={() => setRefresh(r => r+1)}>Retry</Button></div> : loading ? (
            <div className="flex items-center justify-center py-16"><AppSpinner size="md" /></div>
          ) : (
            <div className="grid grid-cols-7 border-t border-l border-slate-200">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-3 py-2 border-r border-b border-slate-200 bg-slate-50">
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const dayStr = format(day, 'yyyy-MM-dd')
                const inMonth = isSameMonth(day, cursor)
                const isToday = dayStr === todayStr
                const onDay = leavesOnDay(day)
                const conflict = deptConflictCount(day) >= 3
                return (
                  <button
                    type="button"
                    aria-label={`${format(day, 'MMMM d, yyyy')}, ${onDay.length} requests`}
                    aria-pressed={selectedDate === dayStr}
                    onClick={() => setSelectedDate(dayStr)}
                    key={dayStr}
                    className={`min-w-0 min-h-[70px] sm:min-h-[120px] text-left align-top p-1.5 sm:p-2 border-r border-b border-slate-200 ${inMonth ? 'bg-white' : 'bg-slate-50/60'} ${selectedDate === dayStr ? 'ring-2 ring-[#ff5900] ring-inset bg-orange-50/40' : 'hover:bg-orange-50/30'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${inMonth ? 'text-slate-700' : 'text-slate-300'} ${isToday ? 'rounded-full bg-[#ff5900] text-white px-1.5 py-0.5' : ''}`}>
                        {format(day, 'd')}
                      </span>
                      {conflict && (
                        <span title="3+ employees from same department off this day" className="text-amber-500">
                          <AlertTriangle className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <div className="hidden sm:block space-y-1">
                      {onDay.slice(0, 4).map((l) => (
                        <div
                          key={l.id}
                          title={`${l.employee.firstName} ${l.employee.lastName} — ${l.leaveType.name}${l.reason ? ` (${l.reason})` : ''}`}
                          className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${typeColor(l.leaveType.code)} ${l.status === 'PENDING' ? 'opacity-60 italic' : ''}`}
                        >
                          {l.employee.firstName} {l.employee.lastName[0]}. · {l.leaveType.code}
                        </div>
                      ))}
                      {onDay.length > 4 && (
                        <div className="text-[10px] text-slate-500 pl-1.5">+{onDay.length - 4} more</div>
                      )}
                    </div>
                    {onDay.length > 0 && <span className="sm:hidden mt-2 block rounded bg-blue-50 py-1 text-center text-[10px] font-semibold text-[#162d54]">{onDay.length}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && !error && <Card>
        <CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base"><span>{format(new Date(`${selectedDate}T12:00:00`), 'EEEE, MMMM d, yyyy')}</span><span className="text-sm font-normal text-slate-500">{selectedLeaves.length} requests</span></CardTitle></CardHeader>
        <CardContent>{selectedLeaves.length === 0 ? <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">No leave requests for this day with the current filters.</p> : <div className="grid gap-3 lg:grid-cols-2">{selectedLeaves.map(l => <div key={l.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-[#162d54]">{l.employee.firstName} {l.employee.lastName}</p><p className="mt-1 text-xs text-slate-500">{l.employee.employeeNo} | {l.employee.department?.name ?? 'No department'}</p></div><Badge className={getStatusColor(l.status)}>{l.status === 'PENDING' ? 'Pending' : 'Approved'}</Badge></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><Badge variant="outline" className={typeColor(l.leaveType.code)}>{l.leaveType.name}</Badge><span className="text-slate-500">{l.leaveType.isWithPay ? 'Paid leave' : 'Unpaid leave'}</span></div><p className="mt-3 text-xs text-slate-500">{l.startDate.slice(0,10)} to {l.endDate.slice(0,10)}{l.totalDays != null ? ` | ${l.totalDays} day(s)` : ''}</p>{l.reason && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{l.reason}</p>}</div>)}</div>}</CardContent>
      </Card>}
      {/* Legend */}
      <div className="flex flex-wrap gap-2 items-center text-xs text-slate-600">
        <span>Leave type:</span>
        {Object.entries(TYPE_COLORS).map(([code, cls]) => (
          <Badge key={code} variant="outline" className={cls}>{code}</Badge>
        ))}
        <span className="ml-3 inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-amber-500" /> Coverage risk (3+ same-dept)
        </span>
      </div>
    </div>
  )
}
