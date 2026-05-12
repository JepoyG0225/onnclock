'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarDays, Users, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
          setLeaves([])
          setDepts([])
          return
        }
        setLeaves(data.leaves ?? [])
        setDepts(data.departments ?? [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
    // gridStart/gridEnd change with cursor; filterDept + includePending too
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, filterDept, includePending])

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
    return leaves.filter((l) => {
      const s = parseISO(l.startDate)
      const e = parseISO(l.endDate)
      return day >= s && day <= e
    })
  }

  // Conflict warning: 3+ employees from same department off on the same day.
  function deptConflictCount(day: Date): number {
    const onDay = leavesOnDay(day)
    const byDept = new Map<string, number>()
    for (const l of onDay) {
      const d = l.employee.department?.id ?? '—'
      byDept.set(d, (byDept.get(d) ?? 0) + 1)
    }
    return Math.max(0, ...Array.from(byDept.values())) // largest dept on this day
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-blue-600" />
            Team Time-off Calendar
          </h1>
          <p className="text-gray-500 text-sm mt-1">Who&apos;s out this month — for coverage planning and conflict spotting.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => subMonths(c, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-bold text-lg min-w-[180px] text-center">{format(cursor, 'MMMM yyyy')}</div>
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => addMonths(c, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
            Today
          </Button>

          {depts.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Department</label>
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="border rounded px-2 py-1 text-sm bg-white"
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
              className="rounded"
            />
            Include pending
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            {leaves.length} {includePending ? 'leave request' : 'approved leave'}{leaves.length !== 1 ? 's' : ''} overlapping this month
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
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
                  <div
                    key={dayStr}
                    className={`min-h-[100px] p-2 border-r border-b border-slate-200 ${inMonth ? 'bg-white' : 'bg-slate-50/60'} ${isToday ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${inMonth ? 'text-slate-700' : 'text-slate-300'} ${isToday ? 'text-blue-600' : ''}`}>
                        {format(day, 'd')}
                      </span>
                      {conflict && (
                        <span title="3+ employees from same department off this day" className="text-amber-500">
                          <AlertTriangle className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
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
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
