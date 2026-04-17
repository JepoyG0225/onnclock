'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, Pencil, Plus, Users, X } from 'lucide-react'
import { toast } from 'sonner'

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  FIXED: 'Fixed Schedule',
  FLEXITIME: 'Flexible',
  SHIFTING: 'Shifting',
  COMPRESSED: 'Compressed Work Week',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface ScheduleShift {
  id: string
  dayOfWeek: number | null
  timeIn: string
  timeOut: string
  breakMinutes: number
}

interface Schedule {
  id: string
  name: string
  scheduleType: string
  requireSelfieOnClockIn: boolean
  workHoursPerDay: number
  workDaysPerWeek: number
  timeIn: string | null
  timeOut: string | null
  breakMinutes: number
  workDays: number[]
  _count: { employees: number }
  scheduleShifts: ScheduleShift[]
}

type ScheduleForm = {
  name: string
  scheduleType: string
  requireSelfieOnClockIn: boolean
  timeIn: string
  timeOut: string
  breakMinutes: number
  workHoursPerDay: number
  workDaysPerWeek: number
  workDays: number[]
}

const DEFAULT_FORM: ScheduleForm = {
  name: '',
  scheduleType: 'FIXED',
  requireSelfieOnClockIn: false,
  timeIn: '08:00',
  timeOut: '17:00',
  breakMinutes: 60,
  workHoursPerDay: 8,
  workDaysPerWeek: 5,
  workDays: [1, 2, 3, 4, 5],
}

function toForm(schedule: Schedule): ScheduleForm {
  return {
    name: schedule.name,
    scheduleType: schedule.scheduleType,
    requireSelfieOnClockIn: !!schedule.requireSelfieOnClockIn,
    timeIn: schedule.timeIn ?? '08:00',
    timeOut: schedule.timeOut ?? '17:00',
    breakMinutes: Number(schedule.breakMinutes ?? 60),
    workHoursPerDay: Number(schedule.workHoursPerDay ?? 8),
    workDaysPerWeek: Number(schedule.workDaysPerWeek ?? 5),
    workDays: Array.isArray(schedule.workDays) && schedule.workDays.length > 0 ? schedule.workDays : [1, 2, 3, 4, 5],
  }
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ScheduleForm>(DEFAULT_FORM)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ScheduleForm | null>(null)
  const [savingEditId, setSavingEditId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/schedules')
      const data = await res.json().catch(() => ({}))
      setSchedules(data.schedules ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const selectedDaysLabel = useMemo(
    () => form.workDays.map(d => DAYS[d]).join(', ') || '-',
    [form.workDays]
  )

  const selectedEditDaysLabel = useMemo(
    () => editForm?.workDays.map(d => DAYS[d]).join(', ') || '-',
    [editForm?.workDays]
  )

  function toggleCreateDay(day: number) {
    setForm(prev => {
      const next = prev.workDays.includes(day)
        ? prev.workDays.filter(d => d !== day)
        : [...prev.workDays, day].sort((a, b) => a - b)
      return { ...prev, workDays: next, workDaysPerWeek: next.length || prev.workDaysPerWeek }
    })
  }

  function toggleEditDay(day: number) {
    setEditForm(prev => {
      if (!prev) return prev
      const next = prev.workDays.includes(day)
        ? prev.workDays.filter(d => d !== day)
        : [...prev.workDays, day].sort((a, b) => a - b)
      return { ...prev, workDays: next, workDaysPerWeek: next.length || prev.workDaysPerWeek }
    })
  }

  async function addSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Schedule name is required.')
      return
    }
    if (form.workDays.length === 0) {
      toast.error('Select at least one work day.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        breakMinutes: Number(form.breakMinutes),
        workHoursPerDay: Number(form.workHoursPerDay),
        workDaysPerWeek: Number(form.workDaysPerWeek),
      }
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to add schedule')
        return
      }
      toast.success('Schedule added')
      setShowForm(false)
      setForm(DEFAULT_FORM)
      await load()
    } finally {
      setSaving(false)
    }
  }

  function startEdit(schedule: Schedule) {
    setEditingId(schedule.id)
    setEditForm(toForm(schedule))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(null)
  }

  async function saveEdit(scheduleId: string) {
    if (!editForm) return

    if (!editForm.name.trim()) {
      toast.error('Schedule name is required.')
      return
    }
    if (editForm.workDays.length === 0) {
      toast.error('Select at least one work day.')
      return
    }

    setSavingEditId(scheduleId)
    try {
      const payload = {
        ...editForm,
        breakMinutes: Number(editForm.breakMinutes),
        workHoursPerDay: Number(editForm.workHoursPerDay),
        workDaysPerWeek: Number(editForm.workDaysPerWeek),
      }
      const res = await fetch(`/api/schedules/${scheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to update schedule')
        return
      }
      toast.success('Schedule updated')
      cancelEdit()
      await load()
    } finally {
      setSavingEditId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Schedules</h1>
          <p className="text-gray-500 text-sm mt-1">View and edit employee work schedules and shift patterns</p>
        </div>
        <Button
          onClick={() => setShowForm(v => !v)}
          className="text-white"
          style={{ background: '#fa5e01' }}
        >
          <Plus className="w-4 h-4 mr-2" />
          {showForm ? 'Cancel' : 'Add Schedule'}
        </Button>
      </div>

      {showForm && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-sm text-orange-800">New Work Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={addSchedule} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Schedule Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Standard (8am-5pm)"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Schedule Type</label>
                <select
                  value={form.scheduleType}
                  onChange={e => setForm(f => ({ ...f, scheduleType: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {Object.keys(SCHEDULE_TYPE_LABELS).map(key => (
                    <option key={key} value={key}>{SCHEDULE_TYPE_LABELS[key]}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600 block mb-1">Clock-In Selfie</label>
                <label className="flex items-center gap-3 p-3 rounded-lg border bg-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.requireSelfieOnClockIn}
                    onChange={e => setForm(f => ({ ...f, requireSelfieOnClockIn: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Require selfie before clocking in</p>
                    <p className="text-xs text-gray-500">Employees assigned to this schedule must capture a selfie during clock-in.</p>
                  </div>
                </label>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Time In</label>
                <input
                  type="time"
                  value={form.timeIn}
                  onChange={e => setForm(f => ({ ...f, timeIn: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Time Out</label>
                <input
                  type="time"
                  value={form.timeOut}
                  onChange={e => setForm(f => ({ ...f, timeOut: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Break (minutes)</label>
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={form.breakMinutes}
                  onChange={e => setForm(f => ({ ...f, breakMinutes: Number(e.target.value) }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Hours per Day</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={form.workHoursPerDay}
                  onChange={e => setForm(f => ({ ...f, workHoursPerDay: Number(e.target.value) }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Days per Week</label>
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={form.workDaysPerWeek}
                  onChange={e => setForm(f => ({ ...f, workDaysPerWeek: Number(e.target.value) }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Work Days</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleCreateDay(idx)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition ${
                        form.workDays.includes(idx)
                          ? 'bg-[#2E4156] text-white border-[#2E4156]'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-[#2E4156]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Selected: {selectedDaysLabel}</p>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={saving} className="text-white" style={{ background: '#fa5e01' }}>
                  {saving ? 'Adding...' : 'Add Schedule'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Schedules
            <Badge variant="outline">{schedules.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : schedules.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No schedules configured yet.</div>
          ) : (
            <div className="divide-y">
              {schedules.map(sched => (
                <div key={sched.id} className="p-4 space-y-3">
                  {editingId === sched.id && editForm ? (
                    <div className="border rounded-xl p-4 bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Schedule Name *</label>
                        <input
                          value={editForm.name}
                          onChange={e => setEditForm(f => (f ? { ...f, name: e.target.value } : f))}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Schedule Type</label>
                        <select
                          value={editForm.scheduleType}
                          onChange={e => setEditForm(f => (f ? { ...f, scheduleType: e.target.value } : f))}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        >
                          {Object.keys(SCHEDULE_TYPE_LABELS).map(key => (
                            <option key={key} value={key}>{SCHEDULE_TYPE_LABELS[key]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="flex items-center gap-3 p-3 rounded-lg border bg-white cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editForm.requireSelfieOnClockIn}
                            onChange={e => setEditForm(f => (f ? { ...f, requireSelfieOnClockIn: e.target.checked } : f))}
                            className="h-4 w-4"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-800">Require selfie before clocking in</p>
                            <p className="text-xs text-gray-500">Employees assigned to this schedule must capture a selfie during clock-in.</p>
                          </div>
                        </label>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Time In</label>
                        <input
                          type="time"
                          value={editForm.timeIn}
                          onChange={e => setEditForm(f => (f ? { ...f, timeIn: e.target.value } : f))}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Time Out</label>
                        <input
                          type="time"
                          value={editForm.timeOut}
                          onChange={e => setEditForm(f => (f ? { ...f, timeOut: e.target.value } : f))}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Break (minutes)</label>
                        <input
                          type="number"
                          min={0}
                          max={240}
                          value={editForm.breakMinutes}
                          onChange={e => setEditForm(f => (f ? { ...f, breakMinutes: Number(e.target.value) } : f))}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Hours per Day</label>
                        <input
                          type="number"
                          min={1}
                          max={24}
                          value={editForm.workHoursPerDay}
                          onChange={e => setEditForm(f => (f ? { ...f, workHoursPerDay: Number(e.target.value) } : f))}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Days per Week</label>
                        <input
                          type="number"
                          min={1}
                          max={7}
                          value={editForm.workDaysPerWeek}
                          onChange={e => setEditForm(f => (f ? { ...f, workDaysPerWeek: Number(e.target.value) } : f))}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Work Days</label>
                        <div className="flex flex-wrap gap-2">
                          {DAYS.map((label, idx) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => toggleEditDay(idx)}
                              className={`px-2.5 py-1 rounded-full text-xs border transition ${
                                editForm.workDays.includes(idx)
                                  ? 'bg-[#2E4156] text-white border-[#2E4156]'
                                  : 'bg-white text-gray-600 border-gray-300 hover:border-[#2E4156]'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">Selected: {selectedEditDaysLabel}</p>
                      </div>
                      <div className="md:col-span-2 flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={cancelEdit}>
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          className="text-white"
                          style={{ background: '#fa5e01' }}
                          disabled={savingEditId === sched.id}
                          onClick={() => saveEdit(sched.id)}
                        >
                          {savingEditId === sched.id ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{sched.name}</span>
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {SCHEDULE_TYPE_LABELS[sched.scheduleType] ?? sched.scheduleType}
                          </span>
                          {sched.requireSelfieOnClockIn && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                              Selfie Required
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {sched.timeIn && sched.timeOut
                            ? `${sched.timeIn} - ${sched.timeOut}`
                            : 'Standard hours'}
                          {sched.breakMinutes > 0 ? ` | ${sched.breakMinutes}m break` : ''}
                        </div>
                        {sched.scheduleShifts.length > 0 && (
                          <div className="text-[11px] text-gray-500">
                            {sched.scheduleShifts.map(shift => (
                              <span key={shift.id} className="inline-block mr-2">
                                {(shift.dayOfWeek != null ? DAYS[shift.dayOfWeek] : '-')} {shift.timeIn}-{shift.timeOut}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="text-xs text-gray-500">
                          {sched.workHoursPerDay}h/day | {sched.workDaysPerWeek}d/week | Days: {sched.workDays?.map(d => DAYS[d]).join(', ') || '-'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Users className="w-3.5 h-3.5" />
                          {sched._count.employees} employee{sched._count.employees !== 1 ? 's' : ''}
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => startEdit(sched)}>
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#D4D8DD] border-[#AAB7B7]">
        <CardContent className="p-4 text-sm text-[#1A2D42] space-y-1">
          <p className="font-semibold">DOLE Compressed Work Week Requirements</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-[#1A2D42]">
            <li>Maximum 12 hours per day for compressed work week</li>
            <li>OT starts after 8 hours for regular employees (unless CWW is approved)</li>
            <li>Night differential applies for hours worked 10:00 PM - 6:00 AM</li>
            <li>1-hour meal break is mandated; not counted as working hours</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

