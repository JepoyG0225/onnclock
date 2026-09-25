'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

type Schedule = {
  id: string
  name: string
  scheduleType: string
  timeIn: string | null
  timeOut: string | null
  workDays: unknown
  workHoursPerDay: number | null
}

export function ScheduleSelector() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [currentId, setCurrentId] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/employees/me/schedule', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Unable to load schedules')
        if (!active) return
        setEnabled(Boolean(data.enabled))
        setSchedules(Array.isArray(data.schedules) ? data.schedules : [])
        setSelectedId(data.currentScheduleId || '')
        setCurrentId(data.currentScheduleId || '')
      })
      .catch(error => {
        if (active) toast.error(error instanceof Error ? error.message : 'Unable to load schedules')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  async function save() {
    if (!selectedId) return toast.error('Select a schedule first')
    setSaving(true)
    try {
      const response = await fetch('/api/employees/me/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId: selectedId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to update schedule')
      setCurrentId(selectedId)
      toast.success(`Schedule changed to ${data.schedule.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update schedule')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null
  if (!enabled) return null

  const selected = schedules.find(schedule => schedule.id === selectedId)

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-slate-900">My work schedule</h2>
          <p className="mt-0.5 text-xs text-slate-500">Choose the default schedule used for your attendance.</p>
          {schedules.length ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                value={selectedId}
                onChange={event => setSelectedId(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select a schedule</option>
                {schedules.map(schedule => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.name}{schedule.timeIn && schedule.timeOut ? ` (${schedule.timeIn}–${schedule.timeOut})` : ''}
                  </option>
                ))}
              </select>
              <Button onClick={() => void save()} disabled={saving || !selectedId || selectedId === currentId}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save schedule
              </Button>
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">No active schedules are available. Contact your administrator.</p>
          )}
          {selected && (
            <p className="mt-2 text-xs text-slate-500">
              {selected.scheduleType.replaceAll('_', ' ')}
              {selected.workHoursPerDay ? ` · ${selected.workHoursPerDay} hours/day` : ''}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
