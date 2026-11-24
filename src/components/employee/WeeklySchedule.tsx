'use client'
import { AppSpinner } from '@/components/ui/AppSpinner'


import { ScheduleLocalTime } from './ScheduleLocalTime'
import { useEffect, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { getManilaDateOnly } from '@/lib/date-manila'
import { scheduleWeekStart } from '@/lib/attendance/schedule-week'

type Day = {
  date: string
  shifts: { timezone?:string;scheduledStart?:string|null;scheduledEnd?:string|null; name: string; timeIn: string | null; timeOut: string | null; isRestDay: boolean; nextDay: boolean; breakMinutes: number | null }[]
  leaves: { name: string; period: string }[]
}
const key = (date: Date) => date.toISOString().slice(0, 10)
const dateLabel = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(date)
const time = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number)
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
}

export function WeeklySchedule() {
  const [week, setWeek] = useState(() => key(scheduleWeekStart(getManilaDateOnly())))
  const [today, setToday] = useState(() => key(getManilaDateOnly()))
  const [days, setDays] = useState<Day[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let current = true
    const controller = new AbortController()
    setLoading(true); setError(''); setDays([])
    fetch(`/api/employees/me/schedule?week=${week}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error || 'Unable to load your schedule.'); return data })
      .then(data => { if (current) { setDays(data.days ?? []); setToday(data.today ?? key(getManilaDateOnly())) } })
      .catch(error => { if (current) setError(error.message || 'Unable to load your schedule.') })
      .finally(() => { if (current) setLoading(false) })
    const reload = () => setRefresh(value => value + 1)
    window.addEventListener('focus', reload); window.addEventListener('online', reload)
    return () => { current = false; controller.abort(); window.removeEventListener('focus', reload); window.removeEventListener('online', reload) }
  }, [week, refresh])
  const start = new Date(`${week}T00:00:00Z`)
  const end = new Date(start.getTime() + 6 * 86400000)
  const move = (direction: number) => setWeek(key(new Date(start.getTime() + direction * 7 * 86400000)))
  const workDays = days.filter(day => day.shifts.some(shift => !shift.isRestDay)).length
  const restDays = days.filter(day => day.shifts.length && day.shifts.every(shift => shift.isRestDay)).length
  return (
    <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm" aria-label="Weekly schedule">
      <div className="space-y-3 border-b border-blue-100 bg-gradient-to-r from-blue-50/80 to-emerald-50/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><CalendarDays className="h-4 w-4 text-blue-600" />My week</h2>
            <p className="mt-1 text-[11px] text-slate-500">Assigned schedule · Philippine time</p>
          </div>
          <button type="button" onClick={() => setRefresh(value => value + 1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50" aria-label="Refresh weekly schedule"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="flex items-center justify-between gap-1 rounded-xl bg-white/80 p-1">
          <button type="button" aria-label="Previous week" onClick={() => move(-1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-white"><ChevronLeft className="h-4 w-4" /></button>
          <p className="text-center text-xs font-semibold text-slate-800" aria-live="polite">{dateLabel(start, { month: 'short', day: 'numeric' })} – {dateLabel(end, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          <button type="button" aria-label="Next week" onClick={() => move(1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-white"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-500">{loading ? 'Loading your week…' : error ? 'Schedule unavailable' : `${workDays} scheduled ${workDays === 1 ? 'day' : 'days'} · ${restDays} rest ${restDays === 1 ? 'day' : 'days'}`}</span>
          <button type="button" onClick={() => { setWeek(key(scheduleWeekStart(getManilaDateOnly()))); setRefresh(value => value + 1) }} className="shrink-0 rounded-md px-2 py-1 font-semibold text-blue-600 hover:bg-blue-50">This week</button>
        </div>
      </div>
      <div aria-busy={loading}>
        {loading ? <AppSpinner size="md" message="Loading weekly schedule..." className="py-8" />
          : error ? <div role="alert" className="p-5 text-sm text-red-600">{error}<button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-3 block font-semibold underline">Try again</button></div>
          : <ol className="divide-y divide-slate-100">{days.map(day => {
            const date = new Date(`${day.date}T00:00:00Z`)
            const isToday = day.date === today
            return <li key={day.date} aria-current={isToday ? 'date' : undefined} className={`flex gap-3 px-4 py-3.5 ${isToday ? 'bg-blue-50/60' : ''}`}>
              <div className={`w-12 shrink-0 text-center ${isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                <p className="text-[10px] font-semibold uppercase">{dateLabel(date, { weekday: 'short' })}</p>
                <p className="text-xl font-bold leading-7">{date.getUTCDate()}</p>
                {isToday && <span className="text-[9px] font-bold">TODAY</span>}
              </div>
              <div className="min-w-0 flex-1 space-y-2 self-center">
                {!day.shifts.length && <p className="text-xs text-slate-400">No schedule assigned</p>}
                {day.shifts.map((shift, index) => <div key={index}>
                  {shift.isRestDay ? <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Rest day</span>
                    : <><p className="text-xs font-semibold leading-5 text-blue-900">{shift.timeIn && shift.timeOut ? `${time(shift.timeIn)} – ${time(shift.timeOut)}` : 'Flexible hours'}{shift.nextDay && <span className="ml-1 text-[10px] font-normal text-blue-600">+1 day</span>}</p>
                      <ScheduleLocalTime shift={shift}/><p className="break-words text-[10px] leading-4 text-slate-500">{shift.name}{shift.breakMinutes !== null && shift.breakMinutes > 0 ? ` · ${shift.breakMinutes}m break` : ''}</p></>}
                </div>)}
                {day.leaves?.map((leave, index) => <p key={index} className="w-fit rounded-md bg-violet-50 px-2 py-1 text-[10px] leading-4 text-violet-700">Approved {leave.period === 'AM' ? 'morning' : leave.period === 'PM' ? 'afternoon' : 'full-day'} leave · {leave.name}</p>)}
              </div>
            </li>
          })}</ol>}
      </div>
      <p className="border-t border-slate-100 px-4 py-3 text-[10px] leading-4 text-slate-400">Schedules are managed by your company. Contact your administrator for changes.</p>
    </section>
  )
}
