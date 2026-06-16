'use client'

import { useEffect, useState } from 'react'
import {
  BarChart3, Users, TrendingDown, TrendingUp, Calendar, Clock, AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AppSpinner } from '@/components/ui/AppSpinner'

type Overview = {
  generatedAt: string
  headcount: {
    active: number
    total: number
    byDepartment: { name: string; count: number }[]
    genderSplit: { male: number; female: number; other: number }
    tenure: { lt1: number; y1to3: number; y3to5: number; y5to10: number; gt10: number }
  }
  hireSeparationTrend: { month: string; hires: number; separations: number }[]
  turnover: { separationsLast12Mo: number; averageHeadcount: number; ratePercent: number }
  leaveUtilization: {
    year: number
    totalDays: number
    byType: { code: string; name: string; days: number; count: number }[]
  }
  attendance30d: {
    totalShifts: number
    lateShifts: number
    regularHours: number
    overtimeHours: number
    nightDiffHours: number
    lateMinutes: number
    undertimeMinutes: number
    averageLateMinutesPerShift: number
    lateShiftRatePercent: number
  }
}

function fmtMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'short' })
}

function fmtNum(n: number) {
  return n.toLocaleString('en-PH')
}

function fmtMinutes(mins: number) {
  if (mins < 60) return `${Math.round(mins)}m`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const res = await fetch('/api/analytics/overview')
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) { setError(json.error ?? 'Failed to load analytics'); return }
        setData(json)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center py-24"><AppSpinner size="lg" /></div>
  }
  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-slate-600">{error ?? 'No data'}</p>
      </div>
    )
  }

  const turnoverColor =
    data.turnover.ratePercent < 10 ? 'text-emerald-600' :
    data.turnover.ratePercent < 20 ? 'text-amber-600' : 'text-red-600'

  // Hire/separation chart bounds
  const maxHs = Math.max(
    1,
    ...data.hireSeparationTrend.map((m) => Math.max(m.hires, m.separations)),
  )

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            HR Analytics
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Headcount, turnover, leave utilization and attendance trends — refreshed live.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Generated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Active Employees', value: fmtNum(data.headcount.active), sub: `${fmtNum(data.headcount.total)} total`, icon: Users, color: 'text-slate-800' },
          { label: 'Turnover (12mo)', value: `${data.turnover.ratePercent}%`, sub: `${data.turnover.separationsLast12Mo} separations`, icon: TrendingDown, color: turnoverColor },
          { label: 'Leave days used', value: `${data.leaveUtilization.totalDays.toFixed(1)}d`, sub: `${data.leaveUtilization.year} YTD`, icon: Calendar, color: 'text-blue-700' },
          { label: 'Late-shift rate', value: `${data.attendance30d.lateShiftRatePercent}%`, sub: `${data.attendance30d.totalShifts} shifts (30d)`, icon: Clock, color: data.attendance30d.lateShiftRatePercent < 10 ? 'text-emerald-600' : 'text-amber-600' },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{k.label}</p>
                <k.icon className="w-4 h-4 text-slate-400" />
              </div>
              <p className={`text-2xl font-black mt-1 ${k.color}`}>{k.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hires vs Separations chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" /> Hires vs Separations (12 mo)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.hireSeparationTrend.map((m) => (
                <div key={m.month} className="flex items-center gap-2 text-xs">
                  <span className="w-10 text-slate-500 font-medium">{fmtMonth(m.month)}</span>
                  <div className="flex-1 flex gap-1">
                    <div className="flex-1 bg-slate-100 rounded-sm h-5 relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-emerald-500 rounded-sm"
                        style={{ width: `${(m.hires / maxHs) * 100}%` }}
                        title={`${m.hires} hires`}
                      />
                      <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-semibold text-emerald-900">
                        {m.hires > 0 ? `+${m.hires}` : ''}
                      </span>
                    </div>
                    <div className="flex-1 bg-slate-100 rounded-sm h-5 relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-red-400 rounded-sm"
                        style={{ width: `${(m.separations / maxHs) * 100}%` }}
                        title={`${m.separations} separations`}
                      />
                      <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-semibold text-red-900">
                        {m.separations > 0 ? `−${m.separations}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-sm" /> Hires</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-sm" /> Separations</span>
            </div>
          </CardContent>
        </Card>

        {/* Headcount by department */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-600" /> Headcount by Department
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.headcount.byDepartment.length === 0 ? (
              <p className="text-xs text-slate-400">No departments configured.</p>
            ) : (
              <div className="space-y-1.5">
                {(() => {
                  const max = Math.max(1, ...data.headcount.byDepartment.map((d) => d.count))
                  return data.headcount.byDepartment.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="w-32 truncate text-slate-700">{d.name}</span>
                      <div className="flex-1 bg-slate-100 rounded-sm h-5 relative">
                        <div
                          className="absolute inset-y-0 left-0 bg-blue-500 rounded-sm"
                          style={{ width: `${(d.count / max) * 100}%` }}
                        />
                        <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-semibold text-blue-50">
                          {d.count}
                        </span>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tenure pyramid */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tenure Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const t = data.headcount.tenure
              const rows = [
                { label: '< 1 year',  v: t.lt1 },
                { label: '1 – 3 yrs',  v: t.y1to3 },
                { label: '3 – 5 yrs',  v: t.y3to5 },
                { label: '5 – 10 yrs', v: t.y5to10 },
                { label: '> 10 yrs',   v: t.gt10 },
              ]
              const max = Math.max(1, ...rows.map((r) => r.v))
              return (
                <div className="space-y-1.5">
                  {rows.map((r) => (
                    <div key={r.label} className="flex items-center gap-2 text-xs">
                      <span className="w-24 text-slate-600">{r.label}</span>
                      <div className="flex-1 bg-slate-100 rounded-sm h-5 relative">
                        <div className="absolute inset-y-0 left-0 bg-indigo-500 rounded-sm" style={{ width: `${(r.v / max) * 100}%` }} />
                        <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-semibold text-indigo-50">{r.v}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </CardContent>
        </Card>

        {/* Leave utilization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-600" /> Leave Utilization ({data.leaveUtilization.year} YTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.leaveUtilization.byType.length === 0 ? (
              <p className="text-xs text-slate-400">No approved leaves this year.</p>
            ) : (
              <div className="space-y-1.5">
                {(() => {
                  const max = Math.max(1, ...data.leaveUtilization.byType.map((t) => t.days))
                  return data.leaveUtilization.byType.map((t) => (
                    <div key={t.code} className="flex items-center gap-2 text-xs">
                      <span className="w-32 truncate text-slate-700"><Badge variant="outline" className="mr-1">{t.code}</Badge>{t.name}</span>
                      <div className="flex-1 bg-slate-100 rounded-sm h-5 relative">
                        <div className="absolute inset-y-0 left-0 bg-purple-500 rounded-sm" style={{ width: `${(t.days / max) * 100}%` }} />
                        <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-semibold text-purple-50">{t.days.toFixed(1)}d · {t.count} reqs</span>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Attendance summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" /> Attendance (Last 30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Total shifts</p>
              <p className="text-xl font-bold mt-1">{fmtNum(data.attendance30d.totalShifts)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Regular hours</p>
              <p className="text-xl font-bold mt-1">{data.attendance30d.regularHours.toFixed(1)}h</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Overtime hours</p>
              <p className="text-xl font-bold mt-1 text-amber-700">{data.attendance30d.overtimeHours.toFixed(1)}h</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Night diff hours</p>
              <p className="text-xl font-bold mt-1 text-indigo-700">{data.attendance30d.nightDiffHours.toFixed(1)}h</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Avg late / shift</p>
              <p className="text-xl font-bold mt-1 text-red-600">{fmtMinutes(data.attendance30d.averageLateMinutesPerShift)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Total late</p>
              <p className="text-xl font-bold mt-1">{fmtMinutes(data.attendance30d.lateMinutes)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Total undertime</p>
              <p className="text-xl font-bold mt-1">{fmtMinutes(data.attendance30d.undertimeMinutes)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Late shifts</p>
              <p className="text-xl font-bold mt-1">{fmtNum(data.attendance30d.lateShifts)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
