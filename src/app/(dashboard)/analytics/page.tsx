'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  BarChart3, Users, TrendingDown, TrendingUp, Calendar, Clock, AlertCircle, RefreshCw, Building2, Hourglass,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { KpiCard } from '@/components/ui/kpi-card'

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
  const [refreshKey, setRefreshKey] = useState(0)
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
      } catch {
        if (!cancelled) setError('Unable to load analytics. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [refreshKey])

  if (loading) {
    return <div className="flex items-center justify-center py-24"><AppSpinner size="lg" message="Loading HR analytics..." /></div>
  }
  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-slate-600">{error ?? 'No data'}</p><Button className="mt-4" onClick={() => setRefreshKey(k => k + 1)}>Try again</Button>
      </div>
    )
  }

  const maxHs = Math.max(1, ...data.hireSeparationTrend.flatMap(m => [m.hires, m.separations]))
  const tenure = [
    { label: 'Less than 1 year', value: data.headcount.tenure.lt1 },
    { label: '1 - 3 years', value: data.headcount.tenure.y1to3 },
    { label: '3 - 5 years', value: data.headcount.tenure.y3to5 },
    { label: '5 - 10 years', value: data.headcount.tenure.y5to10 },
    { label: 'Over 10 years', value: data.headcount.tenure.gt10 },
  ]
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight text-[#162d54]">HR Analytics</h1><p className="mt-1 text-sm text-slate-500">A clear view of your workforce, leave and attendance.</p></div>
        <div className="ml-auto flex items-center gap-3"><span className="text-right text-[11px] text-slate-500">Last updated<br />{new Date(data.generatedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><Button onClick={() => setRefreshKey(k => k + 1)} className="gap-2 rounded-xl"><RefreshCw className="h-4 w-4" />Refresh</Button></div>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Active employees', value: fmtNum(data.headcount.active), sub: `${fmtNum(data.headcount.total)} total employee records`, icon: Users, tone: 'primary' as const },
          { label: 'Turnover', value: `${data.turnover.ratePercent}%`, sub: `${data.turnover.separationsLast12Mo} separations / last 12 months`, icon: TrendingDown, tone: 'neutral' as const },
          { label: 'Leave days used', value: `${data.leaveUtilization.totalDays.toFixed(1)}d`, sub: `${data.leaveUtilization.year} year to date`, icon: Calendar, tone: 'accent' as const },
          { label: 'Late-shift rate', value: `${data.attendance30d.lateShiftRatePercent}%`, sub: `${fmtNum(data.attendance30d.totalShifts)} shifts / last 30 days`, icon: Clock, tone: 'info' as const },
        ].map(k => <KpiCard key={k.label} label={k.label} value={k.value} hint={k.sub} icon={<k.icon className="h-5 w-5" />} tone={k.tone} />)}
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Workforce movement" subtitle="Hires and separations over the last 12 months" icon={<TrendingUp className="h-4 w-4" />} tour="an-turnover">
          <div className="mb-5 flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#0054d7]" />Hires</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#ff5900]" />Separations</span></div>
          <div className="space-y-3">{data.hireSeparationTrend.map(m => <div key={m.month} className="grid grid-cols-[52px_1fr_1fr] items-center gap-3 text-xs"><span className="text-slate-500" title={m.month}>{fmtMonth(m.month)} <span className="text-[10px]">{m.month.slice(2,4)}</span></span>{[{value:m.hires,color:'#0054d7',label:'hires'},{value:m.separations,color:'#ff5900',label:'separations'}].map(item => <div key={item.label} className="flex min-w-0 items-center gap-2" aria-label={`${m.month}: ${item.value} ${item.label}`}><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{width:`${item.value/maxHs*100}%`,backgroundColor:item.color}} /></div><span className="w-6 text-right tabular-nums text-[#162d54]">{item.value}</span></div>)}</div>)}</div>
        </Panel>
        <Panel title="Headcount by department" subtitle="Distribution of active employees" icon={<Building2 className="h-4 w-4" />} tour="an-headcount">
          {data.headcount.byDepartment.length ? <div className="max-h-[390px] space-y-5 overflow-y-auto pr-1">{data.headcount.byDepartment.map(d => <MetricBar key={d.name} label={d.name} value={d.count} max={Math.max(1,...data.headcount.byDepartment.map(d=>d.count))} display={`${fmtNum(d.count)} employees`} color="#162d54" />)}</div> : <EmptyChart text="No department data available." />}
        </Panel>
        <Panel title="Tenure distribution" subtitle="Length of service across the active workforce" icon={<Hourglass className="h-4 w-4" />}>
          <div className="space-y-5">{tenure.map(t => <MetricBar key={t.label} label={t.label} value={t.value} max={Math.max(1,...tenure.map(t=>t.value))} display={fmtNum(t.value)} color="#ff5900" />)}</div>
        </Panel>
        <Panel title="Leave utilization" subtitle={`Approved leave / ${data.leaveUtilization.year} year to date`} icon={<Calendar className="h-4 w-4" />} tour="an-leave">
          {data.leaveUtilization.byType.length ? <div className="max-h-[330px] space-y-5 overflow-y-auto pr-1">{data.leaveUtilization.byType.map(t => <MetricBar key={t.code} label={`${t.code} / ${t.name}`} value={t.days} max={Math.max(1,...data.leaveUtilization.byType.map(t=>t.days))} display={`${t.days.toFixed(1)} days / ${t.count} requests`} color="#0054d7" />)}</div> : <EmptyChart text="No approved leave recorded this year." />}
        </Panel>
      </div>
      <Panel title="Attendance overview" subtitle="Recorded shifts and working hours / last 30 days" icon={<Clock className="h-4 w-4" />} tour="an-attendance">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
          ['Total shifts',fmtNum(data.attendance30d.totalShifts)],
          ['Regular hours',`${data.attendance30d.regularHours.toFixed(1)}h`],
          ['Overtime hours',`${data.attendance30d.overtimeHours.toFixed(1)}h`],
          ['Night differential',`${data.attendance30d.nightDiffHours.toFixed(1)}h`],
          ['Average late / shift',fmtMinutes(data.attendance30d.averageLateMinutesPerShift)],
          ['Total late',fmtMinutes(data.attendance30d.lateMinutes)],
          ['Total undertime',fmtMinutes(data.attendance30d.undertimeMinutes)],
          ['Late shifts',fmtNum(data.attendance30d.lateShifts)],
        ].map(([label,value],i) => <div key={label} className={`min-w-0 rounded-xl border p-4 ${i<4?'border-slate-100 bg-slate-50/70':'border-orange-100/70 bg-orange-50/30'}`}><p className="text-xs text-slate-500">{label}</p><p className="mt-2 break-words text-xl font-semibold tracking-tight text-[#162d54] tabular-nums">{value}</p></div>)}</div>
      </Panel>
    </div>
  )
}

function Panel({title,subtitle,icon,tour,children}:{title:string;subtitle:string;icon:ReactNode;tour?:string;children:ReactNode}) {
  return <Card className="min-w-0 gap-0 overflow-hidden rounded-2xl border-slate-200 py-0 shadow-sm"><CardHeader className="flex flex-row items-center gap-3 border-b border-slate-100 px-5 py-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#ff5900]">{icon}</span><div className="min-w-0"><CardTitle data-tour={tour} className="text-sm font-semibold text-[#162d54]">{title}</CardTitle><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div></CardHeader><CardContent className="p-5">{children}</CardContent></Card>
}
function MetricBar({label,value,max,display,color}:{label:string;value:number;max:number;display:string;color:string}) {
  return <div><div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs"><span className="min-w-0 break-words text-slate-600">{label}</span><span className="font-medium tabular-nums text-[#162d54]">{display}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{width:`${value/max*100}%`,backgroundColor:color}} /></div></div>
}
function EmptyChart({text}:{text:string}) {
  return <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 text-center"><BarChart3 className="h-6 w-6 text-slate-300" /><p className="text-xs text-slate-500">{text}</p></div>
}
