'use client'

import { useEffect, useMemo, useState } from 'react'
import { addDays, format, startOfDay } from 'date-fns'
import { CalendarClock, CheckCircle2, ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type Schedule = {
  id: string
  name: string
  scheduleType: string
  timeIn: string | null
  timeOut: string | null
  workHoursPerDay: number | string | null
}

type Assignment = {
  date: string
  scheduleId: string | null
  isRestDay: boolean
}

function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function scheduleLabel(schedule: Schedule): string {
  return schedule.timeIn && schedule.timeOut
    ? `${schedule.name} · ${schedule.timeIn}–${schedule.timeOut}`
    : schedule.name
}

export function ScheduleSelector() {
  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(startOfDay(new Date()), index)), [])
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingDate, setSavingDate] = useState<string | null>(null)
  const [savedDate, setSavedDate] = useState<string | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [defaultScheduleId, setDefaultScheduleId] = useState('')
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [overriddenDates, setOverriddenDates] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    fetch('/api/employees/me/schedule', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Unable to load schedules')
        if (!active) return
        const rows: Assignment[] = Array.isArray(data.assignments) ? data.assignments : []
        const defaultId = String(data.defaultScheduleId || '')
        const nextSelections: Record<string, string> = {}
        const nextOverrides = new Set<string>()
        for (const day of days) nextSelections[toDateKey(day)] = defaultId
        for (const assignment of rows) {
          if (assignment.scheduleId && !assignment.isRestDay) {
            nextSelections[assignment.date] = assignment.scheduleId
            nextOverrides.add(assignment.date)
          }
        }
        setEnabled(Boolean(data.enabled))
        setSchedules(Array.isArray(data.schedules) ? data.schedules : [])
        setDefaultScheduleId(defaultId)
        setSelections(nextSelections)
        setOverriddenDates(nextOverrides)
      })
      .catch(error => {
        if (active) toast.error(error instanceof Error ? error.message : 'Unable to load schedules')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [days])

  async function changeSchedule(date: string, value: string) {
    const previous = selections[date] ?? defaultScheduleId
    const wasOverride = overriddenDates.has(date)
    setSelections(current => ({ ...current, [date]: value === '__default__' ? defaultScheduleId : value }))
    setSavingDate(date)
    setSavedDate(null)
    try {
      const scheduleId = value === '__default__' ? null : value
      const response = await fetch('/api/employees/me/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, scheduleId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to update schedule')
      setOverriddenDates(current => {
        const next = new Set(current)
        if (scheduleId) next.add(date)
        else next.delete(date)
        return next
      })
      setSavedDate(date)
      window.setTimeout(() => setSavedDate(current => current === date ? null : current), 1800)
      toast.success(scheduleId ? `Schedule saved for ${format(new Date(`${date}T00:00:00`), 'MMM d')}` : 'Default schedule restored')
    } catch (error) {
      setSelections(current => ({ ...current, [date]: previous }))
      setOverriddenDates(current => {
        const next = new Set(current)
        if (wasOverride) next.add(date)
        else next.delete(date)
        return next
      })
      toast.error(error instanceof Error ? error.message : 'Unable to update schedule')
    } finally {
      setSavingDate(null)
    }
  }

  if (loading || !enabled) return null

  const defaultSchedule = schedules.find(schedule => schedule.id === defaultScheduleId)

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-4 text-white sm:px-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-black">My daily schedules</h2>
            <p className="mt-0.5 text-xs text-blue-100">Choose your schedule for each upcoming workday. Changes save automatically.</p>
          </div>
        </div>
      </div>

      {schedules.length ? (
        <div className="divide-y divide-slate-100">
          {days.map((day, index) => {
            const key = toDateKey(day)
            const isSaving = savingDate === key
            const isSaved = savedDate === key
            const hasOverride = overriddenDates.has(key)
            const selectedId = selections[key] || defaultScheduleId
            const selectedSchedule = schedules.find(schedule => schedule.id === selectedId)
            return (
              <div key={key} className={`p-4 sm:flex sm:items-center sm:gap-4 ${index === 0 ? 'bg-blue-50/40' : ''}`}>
                <div className="mb-2 flex items-center justify-between sm:mb-0 sm:w-32 sm:shrink-0 sm:block">
                  <div>
                    <p className="text-sm font-black text-slate-900">{index === 0 ? 'Today' : format(day, 'EEEE')}</p>
                    <p className="text-xs text-slate-500">{format(day, 'MMM d, yyyy')}</p>
                  </div>
                  {hasOverride && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 sm:mt-1 sm:inline-block">Custom</span>}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="relative">
                    <select
                      value={hasOverride ? selectedId : '__default__'}
                      onChange={event => void changeSchedule(key, event.target.value)}
                      disabled={isSaving}
                      aria-label={`Schedule for ${format(day, 'MMMM d, yyyy')}`}
                      className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-11 text-[16px] font-semibold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60 sm:text-sm"
                    >
                      <option value="__default__">Use default{defaultSchedule ? ` — ${scheduleLabel(defaultSchedule)}` : ''}</option>
                      {schedules.map(schedule => <option key={schedule.id} value={schedule.id}>{scheduleLabel(schedule)}</option>)}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400">
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : isSaved ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <ChevronDown className="h-5 w-5" />}
                    </span>
                  </div>
                  {selectedSchedule && (
                    <p className="mt-1.5 truncate px-1 text-xs text-slate-500">
                      {selectedSchedule.scheduleType.replaceAll('_', ' ')}
                      {selectedSchedule.workHoursPerDay ? ` · ${selectedSchedule.workHoursPerDay} hours/day` : ''}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="m-4 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-700">No active schedules are available. Contact your administrator.</p>
      )}
    </section>
  )
}
