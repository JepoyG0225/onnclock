'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Pencil,
  Plus,
  Users,
  X,
  CalendarDays,
  LayoutGrid,
  Trash2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  FIXED: 'Fixed Schedule',
  FLEXITIME: 'Flexible',
  SHIFTING: 'Shifting',
  COMPRESSED: 'Compressed Work Week',
}

const CARD_COLORS = [
  { bg: '#fff3ec', border: '#fa5e01', text: '#c44d00' },
  { bg: '#eef2f7', border: '#2E4156', text: '#1A2D42' },
  { bg: '#f0fdf4', border: '#16a34a', text: '#15803d' },
  { bg: '#fdf4ff', border: '#9333ea', text: '#7e22ce' },
  { bg: '#fffbeb', border: '#d97706', text: '#b45309' },
  { bg: '#f0f9ff', border: '#0284c7', text: '#0369a1' },
]

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface WorkSchedule {
  id: string
  name: string
  scheduleType: string
  timeIn: string | null
  timeOut: string | null
  breakEnabled: boolean
  breakMinutes: number
  workHoursPerDay: number
  workDaysPerWeek: number
  workDays: number[]
  requireSelfieOnClockIn: boolean
  _count: { employees: number }
}

interface ScheduleEmployee {
  id: string
  employeeNo: string
  firstName: string
  lastName: string
  middleName?: string | null
  department: { id: string; name: string } | null
  position: { title: string } | null
  workScheduleId: string | null
}

interface FixedEmployee {
  id: string
  employeeNo: string
  firstName: string
  lastName: string
  middleName?: string | null
  department: { id: string; name: string } | null
  workScheduleId: string | null
}

type FixedEmployeeDraft = {
  scheduleId: string
  dayOffDays: number[]
}

interface ShiftAssignment {
  id: string
  employeeId: string
  date: string
  scheduleId: string | null
  timeIn: string | null
  timeOut: string | null
  isRestDay: boolean
  notes: string | null
  schedule: { id: string; name: string; timeIn: string | null; timeOut: string | null } | null
}

type ScheduleMode = 'FIXED' | 'FLEXIBLE'

type ScheduleForm = {
  name: string
  scheduleType: string
  requireSelfieOnClockIn: boolean
  timeIn: string
  timeOut: string
  breakEnabled: boolean
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
  breakEnabled: true,
  breakMinutes: 60,
  workHoursPerDay: 8,
  workDaysPerWeek: 5,
  workDays: [1, 2, 3, 4, 5],
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmt12(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const [hStr, mStr] = hhmm.split(':')
  let h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toDateStr(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!year || !month || !day) return date.toISOString().slice(0, 10)
  return `${year}-${month}-${day}`
}

function formatHeaderDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function splitBreakMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.min(12 * 60, Number.isFinite(totalMinutes) ? Math.round(totalMinutes) : 0))
  return { hours: Math.floor(safe / 60), minutes: safe % 60 }
}

function combineBreakMinutes(hours: number, minutes: number): number {
  const h = Math.max(0, Math.min(12, Number.isFinite(hours) ? Math.round(hours) : 0))
  const m = Math.max(0, Math.min(59, Number.isFinite(minutes) ? Math.round(minutes) : 0))
  return h * 60 + m
}

function fullName(emp: { firstName: string; lastName: string }): string {
  return `${emp.firstName} ${emp.lastName}`
}

function deriveDayOffDaysFromWorkDays(workDays: number[] | null | undefined): number[] {
  const set = new Set(Array.isArray(workDays) ? workDays : [1, 2, 3, 4, 5])
  return [0, 1, 2, 3, 4, 5, 6].filter(day => !set.has(day))
}

// â”€â”€â”€ Fixed Schedule Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// â”€â”€â”€ Flexible / Weekly Grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ModalState {
  employeeId: string
  employeeName: string
  fixedScheduleId?: string | null
  date: string // YYYY-MM-DD
  existing: ShiftAssignment | null
}

// â”€â”€â”€ Shift template mini-modal (used in Flexible mode) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ShiftTemplateForm {
  name: string
  timeIn: string
  timeOut: string
  workHoursPerDay: number
  breakEnabled: boolean
  breakMinutes: number
  workDays: number[]
}

const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ShiftTemplateModal({
  initial,
  defaultBreakMinutes,
  onClose,
  onSaved,
  onDeleted,
}: {
  initial: WorkSchedule | null   // null = create mode
  defaultBreakMinutes?: number
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}) {
  const fallbackBreakMinutes = Math.max(0, Number(defaultBreakMinutes ?? 60))
  const [form, setForm] = useState<ShiftTemplateForm>({
    name: initial?.name ?? '',
    timeIn: initial?.timeIn ?? '08:00',
    timeOut: initial?.timeOut ?? '17:00',
    workHoursPerDay: Number(initial?.workHoursPerDay ?? 8),
    breakEnabled: initial?.breakEnabled ?? true,
    breakMinutes: Number(initial?.breakMinutes ?? fallbackBreakMinutes),
    workDays: Array.isArray(initial?.workDays) && initial.workDays.length > 0
      ? initial.workDays
      : [1, 2, 3, 4, 5],
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setForm({
      name: initial?.name ?? '',
      timeIn: initial?.timeIn ?? '08:00',
      timeOut: initial?.timeOut ?? '17:00',
      workHoursPerDay: Number(initial?.workHoursPerDay ?? 8),
      breakEnabled: initial?.breakEnabled ?? true,
      breakMinutes: Number(initial?.breakMinutes ?? fallbackBreakMinutes),
      workDays: Array.isArray(initial?.workDays) && initial.workDays.length > 0
        ? initial.workDays
        : [1, 2, 3, 4, 5],
    })
  }, [initial, fallbackBreakMinutes])

  function toggleDay(day: number) {
    setForm(p => ({
      ...p,
      workDays: p.workDays.includes(day)
        ? p.workDays.filter(d => d !== day)
        : [...p.workDays, day].sort((a, b) => a - b),
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Shift name is required'); return }
    if (!form.timeIn || !form.timeOut) { toast.error('Time in and time out are required'); return }
    if (form.workDays.length === 0) { toast.error('Select at least one work day'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        scheduleType: 'FIXED',
        timeIn: form.timeIn,
        timeOut: form.timeOut,
        breakEnabled: form.breakEnabled,
        breakMinutes: form.breakEnabled ? form.breakMinutes : 0,
        workDays: form.workDays,
        workHoursPerDay: Number(form.workHoursPerDay),
        workDaysPerWeek: form.workDays.length,
      }
      const res = initial
        ? await fetch(`/api/schedules/${initial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed to save'); return }
      toast.success(initial ? 'Work hours updated' : 'Work hours added')
      onSaved()
      onClose()
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!initial) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/schedules/${initial.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Cannot delete'); setConfirmDelete(false); return }
      toast.success('Shift deleted')
      onDeleted?.()
      onClose()
    } finally { setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: '#0d1b2a' }}>
          <div>
            <p className="font-bold text-white text-sm">{initial ? 'Edit Work Hours' : 'Add Work Hours'}</p>
            <p className="text-[11px] text-white/50 mt-0.5">Define a reusable shift time block</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Shift label */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Shift Label *</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Morning Shift, Night Shift"
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#fa5e01]/30 focus:border-[#fa5e01] outline-none"
            />
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Time In *</label>
              <input
                type="time"
                value={form.timeIn}
                onChange={e => setForm(p => ({ ...p, timeIn: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#fa5e01]/30 focus:border-[#fa5e01] outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Time Out *</label>
              <input
                type="time"
                value={form.timeOut}
                onChange={e => setForm(p => ({ ...p, timeOut: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#fa5e01]/30 focus:border-[#fa5e01] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Working Hours / Day</label>
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={form.workHoursPerDay}
              onChange={e => setForm(p => ({ ...p, workHoursPerDay: Math.max(1, Number(e.target.value) || 8) }))}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#fa5e01]/30 focus:border-[#fa5e01] outline-none"
            />
          </div>

          {/* Break */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600">Break</label>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, breakEnabled: !p.breakEnabled }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.breakEnabled ? 'bg-[#fa5e01]' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.breakEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
            </div>
            {form.breakEnabled && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">Hours</label>
                    <select
                      value={splitBreakMinutes(form.breakMinutes).hours}
                      onChange={e => {
                        const nextHours = Number(e.target.value)
                        const nextMinutes = splitBreakMinutes(form.breakMinutes).minutes
                        setForm(p => ({ ...p, breakMinutes: combineBreakMinutes(nextHours, nextMinutes) }))
                      }}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#fa5e01]/30 focus:border-[#fa5e01] outline-none"
                    >
                      {Array.from({ length: 13 }, (_, h) => h).map(h => (
                        <option key={h} value={h}>{h}h</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">Minutes</label>
                    <select
                      value={splitBreakMinutes(form.breakMinutes).minutes}
                      onChange={e => {
                        const nextMinutes = Number(e.target.value)
                        const nextHours = splitBreakMinutes(form.breakMinutes).hours
                        setForm(p => ({ ...p, breakMinutes: combineBreakMinutes(nextHours, nextMinutes) }))
                      }}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#fa5e01]/30 focus:border-[#fa5e01] outline-none"
                    >
                      {Array.from({ length: 60 }, (_, m) => m).map(m => (
                        <option key={m} value={m}>{m}m</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {form.breakMinutes > 0 ? `${form.breakMinutes} minute${form.breakMinutes === 1 ? '' : 's'} allowed` : 'No break'}
                </p>
              </>
            )}
            {!form.breakEnabled && (
              <p className="text-[11px] text-amber-600 mt-1">Break is disabled — employees cannot take breaks on this schedule.</p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Work Days *</label>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition ${form.workDays.includes(idx) ? 'bg-[#2E4156] text-white border-[#2E4156]' : 'bg-white text-gray-600 border-gray-300 hover:border-[#fa5e01]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Selected: {form.workDays.map(d => ALL_DAYS[d]).join(', ') || '-'}
            </p>
          </div>

          {/* Live preview */}
          {form.timeIn && form.timeOut && (
            <div className="rounded-xl border-2 px-4 py-2.5 text-sm" style={{ background: '#fff3ec', borderColor: '#fa5e01', color: '#c44d00' }}>
              <p className="font-bold">{fmt12(form.timeIn)} - {fmt12(form.timeOut)}</p>
              <p className="text-[11px] opacity-70 mt-0.5">{form.timeIn} - {form.timeOut}{form.breakMinutes ? ` - ${form.breakMinutes}m break` : ''}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-between gap-3">
          <div>
            {initial && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs font-semibold text-red-400 hover:text-red-600 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
            {initial && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-semibold">Sure?</span>
                <button onClick={handleDelete} disabled={deleting} className="text-xs font-bold text-red-600 hover:underline">{deleting ? 'Deleting...' : 'Yes, delete'}</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:underline">No</button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: '#fa5e01' }}
            >
              {saving ? 'Saving...' : initial ? 'Update' : 'Add Shift'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Flexible Weekly Grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FlexibleScheduleTab({
  schedules,
  loadingSchedules,
  onRefreshSchedules,
  variant = 'FLEXIBLE',
  companyBreakMinutes = 60,
}: {
  schedules: WorkSchedule[]
  loadingSchedules: boolean
  onRefreshSchedules: () => void
  variant?: 'FIXED' | 'FLEXIBLE'
  companyBreakMinutes?: number
}) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [employees, setEmployees] = useState<ScheduleEmployee[]>([])
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([])
  const [loadingGrid, setLoadingGrid] = useState(false)
  const [deptFilter, setDeptFilter] = useState('')
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [modal, setModal] = useState<ModalState | null>(null)
  const [shiftModal, setShiftModal] = useState<{ mode: 'create' } | { mode: 'edit'; schedule: WorkSchedule } | null>(null)
  const [dragOverCell, setDragOverCell] = useState<string | null>(null) // "empId|dateStr"
  const dragScheduleId = useRef<string | null>(null)

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const startStr = toDateStr(weekStart)
  const endStr = toDateStr(addDays(weekStart, 6))
  const todayStr = toDateStr(new Date())

  // Fetch departments
  useEffect(() => {
    fetch('/api/departments')
      .then(r => r.json())
      .then(d => setDepartments(d.departments ?? []))
      .catch(() => {})
  }, [])

  const loadGrid = useCallback(async () => {
    setLoadingGrid(true)
    try {
      const modeQuery = `&mode=${variant}`
      const url = `/api/schedules/assignments?startDate=${startStr}&endDate=${endStr}${modeQuery}${deptFilter ? `&departmentId=${deptFilter}` : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err?.error ?? 'Failed to load schedule grid')
        setEmployees([])
        setAssignments([])
        return
      }
      const data = await res.json().catch(() => ({}))
      setEmployees(data.employees ?? [])
      setAssignments(data.assignments ?? [])
    } finally {
      setLoadingGrid(false) }
  }, [startStr, endStr, deptFilter, variant])

  useEffect(() => { loadGrid() }, [loadGrid])

  function getAssignment(empId: string, dateStr: string): ShiftAssignment | null {
    return assignments.find(a => a.employeeId === empId && a.date.slice(0, 10) === dateStr) ?? null
  }

  // Drag handlers
  function onDragStart(schedId: string) {
    dragScheduleId.current = schedId
  }

  async function onDrop(empId: string, dateStr: string) {
    if (variant !== 'FLEXIBLE') return
    const schedId = dragScheduleId.current
    setDragOverCell(null)
    dragScheduleId.current = null
    if (!schedId) return
    await upsertAssignment({ employeeId: empId, date: dateStr, mode: variant, scheduleId: schedId, isRestDay: false })
  }

  async function upsertAssignment(payload: {
    employeeId: string
    date: string
    mode?: 'FIXED' | 'FLEXIBLE'
    scheduleId?: string | null
    timeIn?: string | null
    timeOut?: string | null
    isRestDay: boolean
    notes?: string | null
  }) {
    const tempId = `temp-${payload.employeeId}-${payload.date}-${Date.now()}`
    const template = payload.scheduleId ? schedules.find(s => s.id === payload.scheduleId) : null
    const optimisticTimeIn = payload.isRestDay
      ? null
      : (payload.timeIn ?? template?.timeIn ?? null)
    const optimisticTimeOut = payload.isRestDay
      ? null
      : (payload.timeOut ?? template?.timeOut ?? null)
    const optimisticAssignment: ShiftAssignment = {
      id: tempId,
      employeeId: payload.employeeId,
      date: payload.date,
      scheduleId: payload.scheduleId ?? null,
      timeIn: optimisticTimeIn,
      timeOut: optimisticTimeOut,
      isRestDay: payload.isRestDay ?? false,
      notes: payload.notes ?? null,
      schedule: payload.scheduleId && template
        ? { id: template.id, name: template.name, timeIn: template.timeIn ?? null, timeOut: template.timeOut ?? null }
        : null,
    }

    // Show assignment instantly while persisting in background.
    setAssignments(prev => {
      const filtered = prev.filter(a => !(a.employeeId === payload.employeeId && a.date.slice(0, 10) === payload.date))
      if (payload.isRestDay === false && !payload.scheduleId && !payload.timeIn && !payload.timeOut) return filtered
      return [...filtered, optimisticAssignment]
    })

    try {
      const res = await fetch('/api/schedules/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Rollback optimistic row for this cell on failure.
        setAssignments(prev => prev.filter(a => !(a.employeeId === payload.employeeId && a.date.slice(0, 10) === payload.date)))
        toast.error(data?.error ?? 'Failed to save')
        return
      }
      // Replace optimistic row with server-confirmed row.
      setAssignments(prev => {
        const filtered = prev.filter(a => !(a.employeeId === payload.employeeId && a.date.slice(0, 10) === payload.date))
        if (payload.isRestDay === false && !payload.scheduleId && !payload.timeIn && !payload.timeOut) return filtered
        return [...filtered, data.assignment]
      })
    } catch {
      setAssignments(prev => prev.filter(a => !(a.employeeId === payload.employeeId && a.date.slice(0, 10) === payload.date)))
      toast.error('Failed to save assignment')
    }
  }

  async function deleteAssignment(id: string, empId: string, dateStr: string) {
    try {
      const res = await fetch(`/api/schedules/assignments/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to remove'); return }
      setAssignments(prev => prev.filter(a => !(a.employeeId === empId && a.date.slice(0, 10) === dateStr)))
    } catch {
      toast.error('Failed to remove')
    }
  }

  const colorMap = new Map(
    schedules.map((s, i) => [s.id, CARD_COLORS[i % CARD_COLORS.length]])
  )
  const scheduleById = new Map(
    schedules.map((schedule) => [schedule.id, schedule])
  )

  return (
    <div className="space-y-4">
      {/* â”€â”€ Work Hours Templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {variant === 'FLEXIBLE' && (
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Work Hours</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Drag a card to an employee cell to assign</p>
          </div>
          <button
            onClick={() => setShiftModal({ mode: 'create' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
            style={{ background: '#fa5e01' }}
          >
            <Plus className="w-3.5 h-3.5" /> Add Work Hours
          </button>
        </div>

        {loadingSchedules ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Loading work hours...</p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center py-6 gap-2 text-gray-400">
            <Clock className="w-8 h-8 opacity-30" />
            <p className="text-sm">No work hours defined yet.</p>
            <button
              onClick={() => setShiftModal({ mode: 'create' })}
              className="mt-1 text-xs font-semibold underline text-[#fa5e01]"
            >
              Add your first shift -&gt;
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {schedules.map((s) => {
              const col = colorMap.get(s.id) ?? CARD_COLORS[0]
              return (
                <div key={s.id} className="flex flex-col gap-1.5">
                  {/* Draggable card */}
                  <div
                    draggable
                    onDragStart={() => onDragStart(s.id)}
                    className="cursor-grab active:cursor-grabbing select-none rounded-xl border-2 px-4 py-2.5 transition hover:shadow-md"
                    style={{ background: col.bg, borderColor: col.border, color: col.text }}
                  >
                    <p className="font-bold text-sm leading-tight">
                      {s.timeIn && s.timeOut ? `${fmt12(s.timeIn)} - ${fmt12(s.timeOut)}` : s.name}
                    </p>
                    {s.timeIn && s.timeOut && (
                      <p className="text-[11px] opacity-60 mt-0.5">{s.name}</p>
                    )}
                    {s.breakEnabled && s.breakMinutes > 0 && (
                      <p className="text-[10px] opacity-50 mt-0.5">{s.breakMinutes}m break</p>
                    )}
                    {!s.breakEnabled && (
                      <p className="text-[10px] opacity-50 mt-0.5">No break</p>
                    )}
                  </div>
                  <button
                    onClick={() => setShiftModal({ mode: 'edit', schedule: s })}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    <Pencil className="w-3 h-3" /> Edit Work Hours
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
      )}

      {/* â”€â”€ Week navigation + filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm text-gray-600"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {variant === 'FLEXIBLE' && (
          <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(prev => addDays(prev, -7))}
            className="p-1.5 rounded-lg border hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[160px] text-center">
            {formatHeaderDate(weekStart)} - {formatHeaderDate(addDays(weekStart, 6))}
          </span>
          <button
            onClick={() => setWeekStart(prev => addDays(prev, 7))}
            className="p-1.5 rounded-lg border hover:bg-gray-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setWeekStart(getWeekStart(new Date()))}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Today
          </button>
          </div>
        )}
      </div>

      {/* â”€â”€ Weekly Grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {loadingGrid && (
          <div className="p-6 text-center text-gray-400 text-sm">Loading schedule...</div>
        )}
        {!loadingGrid && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-[#0d1b2a] text-white">
                  <th className="text-left px-4 py-3 font-semibold text-xs w-44 sticky left-0 bg-[#0d1b2a] z-10">
                    Employee
                  </th>
                  {weekDays.map(d => {
                    const ds = toDateStr(d)
                    const isToday = ds === todayStr
                    return (
                      <th
                        key={ds}
                        className={`text-center px-2 py-3 font-semibold text-xs border-l border-white/10 ${isToday ? 'text-[#fa5e01]' : 'text-white/80'}`}
                        style={{ minWidth: 110 }}
                      >
                        <div>{DAYS[d.getDay()]}</div>
                        {variant === 'FLEXIBLE' && (
                          <div className={`text-lg font-extrabold ${isToday ? 'text-[#fa5e01]' : ''}`}>
                            {d.getDate()}
                          </div>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-gray-400">
                      No employees found for this department.
                    </td>
                  </tr>
                )}
                {employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-50/50 group">
                    {/* Employee name column */}
                    <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-gray-50/50 z-10 border-r border-gray-100">
                      <p className="font-semibold text-gray-800 text-xs leading-tight">{fullName(emp)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{emp.department?.name ?? 'No Dept'}</p>
                    </td>
                    {/* Day cells */}
                    {weekDays.map(d => {
                      const ds = toDateStr(d)
                      const cellKey = `${emp.id}|${ds}`
                      const asgn = getAssignment(emp.id, ds)
                      const fixedTemplate =
                        variant === 'FIXED' && emp.workScheduleId
                          ? scheduleById.get(emp.workScheduleId) ?? null
                          : null
                      const weekday = d.getDay()
                      const templateIsWorkDay = fixedTemplate
                        ? fixedTemplate.workDays.includes(weekday)
                        : false
                      const showTemplateFallback = !asgn && variant === 'FIXED' && Boolean(fixedTemplate)
                      const effectiveIsRestDay = asgn
                        ? asgn.isRestDay
                        : showTemplateFallback
                          ? !templateIsWorkDay
                          : false
                      const effectiveTimeIn = asgn
                        ? asgn.timeIn
                        : showTemplateFallback && templateIsWorkDay
                          ? fixedTemplate?.timeIn ?? null
                          : null
                      const effectiveTimeOut = asgn
                        ? asgn.timeOut
                        : showTemplateFallback && templateIsWorkDay
                          ? fixedTemplate?.timeOut ?? null
                          : null
                      const effectiveSchedule = asgn?.schedule
                        ?? (showTemplateFallback && templateIsWorkDay && fixedTemplate
                          ? {
                              id: fixedTemplate.id,
                              name: fixedTemplate.name,
                              timeIn: fixedTemplate.timeIn ?? null,
                              timeOut: fixedTemplate.timeOut ?? null,
                            }
                          : null)
                      const isToday = ds === todayStr
                      const isDragOver = dragOverCell === cellKey
                      const col = effectiveSchedule?.id ? (colorMap.get(effectiveSchedule.id) ?? CARD_COLORS[0]) : null

                      return (
                        <td
                          key={ds}
                          className={`px-1.5 py-1.5 border-l border-gray-100 align-middle transition ${isToday ? 'bg-orange-50/40' : ''} ${isDragOver ? 'bg-orange-100/60 ring-2 ring-[#fa5e01] ring-inset rounded-lg' : ''}`}
                          onDragOver={e => { e.preventDefault(); setDragOverCell(cellKey) }}
                          onDragLeave={() => setDragOverCell(null)}
                          onDrop={() => onDrop(emp.id, ds)}
                        >
                          {asgn || showTemplateFallback ? (
                            <div
                              className={`rounded-lg px-2 py-1.5 cursor-pointer group/cell relative ${asgn?.id.startsWith('temp-') ? 'opacity-80 animate-pulse' : ''}`}
                              style={
                                effectiveIsRestDay
                                  ? { background: '#f1f5f9', border: '1px solid #cbd5e1' }
                                  : col
                                  ? { background: col.bg, border: `1px solid ${col.border}` }
                                  : { background: '#fff3ec', border: '1px solid #fa5e01' }
                              }
                              onClick={() => setModal({ employeeId: emp.id, employeeName: fullName(emp), fixedScheduleId: emp.workScheduleId, date: ds, existing: asgn })}
                            >
                              {effectiveIsRestDay ? (
                                <div className="flex items-center gap-1">
                                  <Coffee className="w-3 h-3 text-slate-400" />
                                  <span className="text-[10px] font-semibold text-slate-500">Rest Day</span>
                                </div>
                              ) : (
                                <>
                                  <p className="text-[10px] font-bold leading-tight" style={{ color: col?.text ?? '#c44d00' }}>
                                    {fmt12(effectiveTimeIn)} - {fmt12(effectiveTimeOut)}
                                  </p>
                                  {effectiveSchedule && (
                                    <p className="text-[9px] opacity-60 mt-0.5 truncate" style={{ color: col?.text ?? '#c44d00' }}>
                                      {effectiveSchedule.name}
                                    </p>
                                  )}
                                  {asgn?.id.startsWith('temp-') && (
                                    <p className="text-[9px] opacity-60 mt-0.5" style={{ color: col?.text ?? '#c44d00' }}>
                                      Saving...
                                    </p>
                                  )}
                                </>
                              )}
                              {/* Delete button */}
                              {asgn && (
                                <button
                                  className="absolute -top-1.5 -right-1.5 hidden group-hover/cell:flex w-4 h-4 rounded-full bg-red-500 text-white items-center justify-center shadow"
                                  onClick={e => { e.stopPropagation(); deleteAssignment(asgn.id, emp.id, ds) }}
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              className="w-full h-10 flex items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-300 hover:border-[#fa5e01] hover:text-[#fa5e01] transition"
                              onClick={() => setModal({ employeeId: emp.id, employeeName: fullName(emp), fixedScheduleId: emp.workScheduleId, date: ds, existing: null })}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* â”€â”€ Assignment Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {modal && (
        <AssignmentModal
          modal={modal}
          schedules={schedules}
          variant={variant}
          onClose={() => setModal(null)}
          onSave={async (payload) => {
            await upsertAssignment({ ...payload, mode: variant, employeeId: modal.employeeId, date: modal.date })
            setModal(null)
          }}
          onDelete={async () => {
            if (modal.existing) await deleteAssignment(modal.existing.id, modal.employeeId, modal.date)
            setModal(null)
          }}
        />
      )}

      {/* â”€â”€ Shift Template Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {shiftModal && (
        <ShiftTemplateModal
          initial={shiftModal.mode === 'edit' ? shiftModal.schedule : null}
          defaultBreakMinutes={companyBreakMinutes}
          onClose={() => setShiftModal(null)}
          onSaved={onRefreshSchedules}
          onDeleted={onRefreshSchedules}
        />
      )}
    </div>
  )
}

// â”€â”€â”€ Assignment Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AssignmentModal({
  modal,
  schedules,
  variant = 'FLEXIBLE',
  onClose,
  onSave,
  onDelete,
}: {
  modal: ModalState
  schedules: WorkSchedule[]
  variant?: 'FIXED' | 'FLEXIBLE'
  onClose: () => void
  onSave: (payload: { scheduleId?: string | null; timeIn?: string | null; timeOut?: string | null; isRestDay: boolean; notes?: string | null }) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const existing = modal.existing
  const [isRestDay, setIsRestDay] = useState(existing?.isRestDay ?? false)
  const [timeIn, setTimeIn] = useState(existing?.timeIn ?? '08:00')
  const [timeOut, setTimeOut] = useState(existing?.timeOut ?? '17:00')
  const [scheduleId, setScheduleId] = useState(existing?.scheduleId ?? modal.fixedScheduleId ?? '')
  const [saving, setSaving] = useState(false)
  const fixedSchedule = variant === 'FIXED' ? schedules.find(s => s.id === modal.fixedScheduleId) : null

  const dayLabel = new Date(modal.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  function applyTemplate(id: string) {
    setScheduleId(id)
    const s = schedules.find(s => s.id === id)
    if (s) {
      if (s.timeIn) setTimeIn(s.timeIn)
      if (s.timeOut) setTimeOut(s.timeOut)
    }
  }

  async function handleSave() {
    const resolvedScheduleId = variant === 'FIXED' ? (modal.fixedScheduleId ?? null) : (scheduleId || null)
    if (variant === 'FIXED' && !isRestDay && !resolvedScheduleId) {
      toast.error('No fixed schedule is assigned to this employee. Set one first in Employee Fixed Assignment.')
      return
    }
    setSaving(true)
    try {
      await onSave({ scheduleId: resolvedScheduleId, timeIn: isRestDay ? null : timeIn, timeOut: isRestDay ? null : timeOut, isRestDay })
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <p className="font-bold text-gray-900">Schedule - {modal.employeeName}</p>
            <p className="text-xs text-gray-500 mt-0.5">{dayLabel}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Rest Day toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border">
            <div>
              <p className="text-sm font-semibold text-gray-800">Rest Day</p>
              <p className="text-xs text-gray-500">Mark as day off</p>
            </div>
            <button
              type="button"
              onClick={() => setIsRestDay(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isRestDay ? 'bg-[#fa5e01]' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isRestDay ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {!isRestDay && (
            <>
              {/* Quick-pick from template */}
              {variant === 'FLEXIBLE' && schedules.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Apply Schedule Template</label>
                  <select
                    value={scheduleId}
                    onChange={e => applyTemplate(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">- Manual entry -</option>
                    {schedules.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.timeIn && s.timeOut ? ` (${s.timeIn}-${s.timeOut})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {variant === 'FIXED' && (
                <div className="rounded-xl border bg-slate-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-gray-700">Fixed Template</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {fixedSchedule
                      ? `${fixedSchedule.name}${fixedSchedule.timeIn && fixedSchedule.timeOut ? ` (${fixedSchedule.timeIn}-${fixedSchedule.timeOut})` : ''}`
                      : 'No fixed schedule assigned'}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Shift Start</label>
                  <input type="time" value={timeIn} onChange={e => setTimeIn(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Shift End</label>
                  <input type="time" value={timeOut} onChange={e => setTimeOut(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3">
          <div>
            {existing && (
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: '#fa5e01' }}
            >
              {saving ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SchedulesPage() {
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<ScheduleMode>('FIXED')
  const [schedules, setSchedules] = useState<WorkSchedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)
  const [companyBreakHours, setCompanyBreakHours] = useState(1)
  const [companyBreakMins, setCompanyBreakMins] = useState(0)
  const [savingCompanyBreak, setSavingCompanyBreak] = useState(false)

  async function loadSchedules() {
    setLoadingSchedules(true)
    try {
      const res = await fetch('/api/schedules')
      const data = await res.json().catch(() => ({}))
      setSchedules(data.schedules ?? [])
    } finally {
      setLoadingSchedules(false)
    }
  }

  useEffect(() => { loadSchedules() }, [])

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const fallback = schedules.length > 0 ? Number(schedules[0]?.breakMinutes ?? 60) : 60
        const minutes = Number(data?.defaultBreakMinutes ?? fallback)
        const next = splitBreakMinutes(minutes)
        setCompanyBreakHours(next.hours)
        setCompanyBreakMins(next.minutes)
      })
      .catch(() => {
        const fallback = schedules.length > 0 ? Number(schedules[0]?.breakMinutes ?? 60) : 60
        const next = splitBreakMinutes(fallback)
        setCompanyBreakHours(next.hours)
        setCompanyBreakMins(next.minutes)
      })
  }, [schedules])

  async function applyCompanyBreakSetup() {
    const nextBreakMinutes = combineBreakMinutes(companyBreakHours, companyBreakMins)
    setSavingCompanyBreak(true)
    try {
      const settingsRes = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultBreakMinutes: nextBreakMinutes }),
      })
      if (!settingsRes.ok) {
        const data = await settingsRes.json().catch(() => ({}))
        toast.error(data?.error ?? 'Failed to save company break setup')
        return
      }

      const jobs = schedules.map(s => fetch(`/api/schedules/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ breakMinutes: nextBreakMinutes }),
      }))
      const results = await Promise.all(jobs)
      const failed = results.filter(r => !r.ok).length
      if (failed > 0) {
        toast.warning(`Break setup saved, but ${failed} schedule${failed > 1 ? 's' : ''} failed to update.`)
      } else {
        toast.success('Company break setup applied to all schedules')
      }
      await loadSchedules()
    } catch {
      toast.error('Failed to apply company break setup')
    } finally {
      setSavingCompanyBreak(false)
    }
  }

  useEffect(() => {
    const requestedMode = searchParams.get('mode')
    if (requestedMode === 'FIXED' || requestedMode === 'FLEXIBLE') {
      setMode(requestedMode)
    }
  }, [searchParams])

  return (
    <div className="space-y-6">
      {/* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Schedules</h1>
          <p className="text-gray-500 text-sm mt-1">
            {mode === 'FIXED'
              ? 'Assign work hours and day offs to employees.'
              : 'Build the weekly schedule by dragging templates to each employee.'}
          </p>
        </div>
        <div />
      </div>

      {/* â”€â”€ Mode toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Company Break Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-gray-500">
            Set your company standard break duration in hours and minutes. This updates all work-hour templates and overbreak tardy tracking.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-[120px]">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Hours</label>
              <select
                value={companyBreakHours}
                onChange={e => setCompanyBreakHours(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {Array.from({ length: 13 }, (_, h) => h).map(h => (
                  <option key={h} value={h}>{h}h</option>
                ))}
              </select>
            </div>
            <div className="w-[140px]">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Minutes</label>
              <select
                value={companyBreakMins}
                onChange={e => setCompanyBreakMins(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {Array.from({ length: 60 }, (_, m) => m).map(m => (
                  <option key={m} value={m}>{m}m</option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              disabled={savingCompanyBreak}
              onClick={applyCompanyBreakSetup}
              className="text-white min-w-[180px] w-auto px-5"
              style={{ background: '#fa5e01' }}
            >
              {savingCompanyBreak ? 'Saving...' : 'Save Break Setup'}
            </Button>
          </div>
          <p className="text-[11px] text-gray-500">
            Current setup: {combineBreakMinutes(companyBreakHours, companyBreakMins)} minute{combineBreakMinutes(companyBreakHours, companyBreakMins) === 1 ? '' : 's'}.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100 w-fit">
        <button
          onClick={() => setMode('FIXED')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
            mode === 'FIXED'
              ? 'bg-white text-gray-900 shadow'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          Fixed Schedules
        </button>
        <button
          onClick={() => setMode('FLEXIBLE')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
            mode === 'FLEXIBLE'
              ? 'bg-white text-gray-900 shadow'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          Flexible Schedules
        </button>
      </div>

      {/* â”€â”€ Mode hint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {mode === 'FIXED' && (
        <div className="flex items-start gap-3 rounded-xl bg-[#fff3ec] border border-[#fa5e01]/30 px-4 py-3 text-sm text-[#c44d00]">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Fixed mode</strong> - Assign work hours and weekly day offs per employee.
            Employees assigned here will use the same schedule every week automatically.
          </span>
        </div>
      )}
      {mode === 'FLEXIBLE' && (
        <div className="flex items-start gap-3 rounded-xl bg-[#eef2f7] border border-[#2E4156]/30 px-4 py-3 text-sm text-[#1A2D42]">
          <LayoutGrid className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Flexible mode</strong> - Assign specific shifts per employee per day.
            Drag a schedule card to any cell, or click <strong>+</strong> to set custom hours or mark as rest day.
          </span>
        </div>
      )}

      {/* â”€â”€ Tab content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {mode === 'FIXED' ? (
        <FlexibleScheduleTab
          schedules={schedules}
          loadingSchedules={loadingSchedules}
          onRefreshSchedules={loadSchedules}
          variant="FIXED"
          companyBreakMinutes={combineBreakMinutes(companyBreakHours, companyBreakMins)}
        />
      ) : (
        <FlexibleScheduleTab
          schedules={schedules}
          loadingSchedules={loadingSchedules}
          onRefreshSchedules={loadSchedules}
          variant="FLEXIBLE"
          companyBreakMinutes={combineBreakMinutes(companyBreakHours, companyBreakMins)}
        />
      )}
    </div>
  )
}

// Wrapper so "Add Schedule" button in header can open the form inside FixedScheduleTab
function FixedScheduleTabWrapper(props: { schedules: WorkSchedule[]; loading: boolean; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    const handler = () => setShowForm(v => !v)
    window.addEventListener('schedules:add', handler)
    return () => window.removeEventListener('schedules:add', handler)
  }, [])

  return <FixedScheduleTabInner {...props} externalShowForm={showForm} onFormClose={() => setShowForm(false)} />
}

function FixedScheduleTabInner({
  schedules,
  loading,
  onRefresh,
  externalShowForm,
  onFormClose,
}: {
  schedules: WorkSchedule[]
  loading: boolean
  onRefresh: () => void
  externalShowForm: boolean
  onFormClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ScheduleForm>(DEFAULT_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ScheduleForm | null>(null)
  const [savingEditId, setSavingEditId] = useState<string | null>(null)
  const [fixedEmployees, setFixedEmployees] = useState<FixedEmployee[]>([])
  const [fixedDepartments, setFixedDepartments] = useState<{ id: string; name: string }[]>([])
  const [fixedDeptFilter, setFixedDeptFilter] = useState('')
  const [loadingFixedEmployees, setLoadingFixedEmployees] = useState(false)
  const [savingFixedEmployeeId, setSavingFixedEmployeeId] = useState<string | null>(null)
  const [fixedDrafts, setFixedDrafts] = useState<Record<string, FixedEmployeeDraft>>({})

  const loadFixedEmployees = useCallback(async () => {
    const weekStart = getWeekStart(new Date())
    const startStr = toDateStr(weekStart)
    const endStr = toDateStr(addDays(weekStart, 6))
    setLoadingFixedEmployees(true)
    try {
      const url = `/api/schedules/assignments?startDate=${startStr}&endDate=${endStr}&mode=FIXED${fixedDeptFilter ? `&departmentId=${fixedDeptFilter}` : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err?.error ?? 'Failed to load employees')
        setFixedEmployees([])
        setFixedDrafts({})
        return
      }
      const data = await res.json().catch(() => ({}))
      const rows: FixedEmployee[] = data.employees ?? []
      setFixedEmployees(rows)
      setFixedDrafts(
        rows.reduce<Record<string, FixedEmployeeDraft>>((acc, emp) => {
          const workDays = schedules.find(s => s.id === emp.workScheduleId)?.workDays
          acc[emp.id] = {
            scheduleId: emp.workScheduleId ?? '',
            dayOffDays: deriveDayOffDaysFromWorkDays(workDays),
          }
          return acc
        }, {})
      )
    } finally {
      setLoadingFixedEmployees(false)
    }
  }, [fixedDeptFilter, schedules])

  useEffect(() => {
    fetch('/api/departments')
      .then(r => r.json())
      .then(d => setFixedDepartments(d.departments ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadFixedEmployees()
  }, [loadFixedEmployees])

  function toggleDay(day: number, isEdit: boolean) {
    if (isEdit) {
      setEditForm(prev => {
        if (!prev) return prev
        const next = prev.workDays.includes(day) ? prev.workDays.filter(d => d !== day) : [...prev.workDays, day].sort((a, b) => a - b)
        return { ...prev, workDays: next, workDaysPerWeek: next.length || prev.workDaysPerWeek }
      })
    } else {
      setForm(prev => {
        const next = prev.workDays.includes(day) ? prev.workDays.filter(d => d !== day) : [...prev.workDays, day].sort((a, b) => a - b)
        return { ...prev, workDays: next, workDaysPerWeek: next.length || prev.workDaysPerWeek }
      })
    }
  }

  async function addSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Schedule name is required.'); return }
    if (form.workDays.length === 0) { toast.error('Select at least one work day.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, breakEnabled: form.breakEnabled, breakMinutes: form.breakEnabled ? Number(form.breakMinutes) : 0, workHoursPerDay: Number(form.workHoursPerDay), workDaysPerWeek: Number(form.workDaysPerWeek) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed to add schedule'); return }
      toast.success('Schedule added')
      setForm(DEFAULT_FORM)
      onFormClose()
      onRefresh()
    } finally { setSaving(false) }
  }

  async function saveEdit(scheduleId: string) {
    if (!editForm) return
    if (!editForm.name.trim()) { toast.error('Schedule name is required.'); return }
    if (editForm.workDays.length === 0) { toast.error('Select at least one work day.'); return }
    setSavingEditId(scheduleId)
    try {
      const res = await fetch(`/api/schedules/${scheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, breakMinutes: Number(editForm.breakMinutes), workHoursPerDay: Number(editForm.workHoursPerDay), workDaysPerWeek: Number(editForm.workDaysPerWeek) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed to update schedule'); return }
      toast.success('Schedule updated')
      setEditingId(null); setEditForm(null)
      onRefresh()
    } finally { setSavingEditId(null) }
  }

  function DayPicker({ workDays, onToggle }: { workDays: number[]; onToggle: (d: number) => void }) {
    return (
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1">Work Days</label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((label, idx) => (
            <button key={label} type="button" onClick={() => onToggle(idx)}
              className={`px-2.5 py-1 rounded-full text-xs border transition ${workDays.includes(idx) ? 'bg-[#2E4156] text-white border-[#2E4156]' : 'bg-white text-gray-600 border-gray-300 hover:border-[#fa5e01]'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-1">Selected: {workDays.map(d => DAYS[d]).join(', ') || '-'}</p>
      </div>
    )
  }

  function FormFields({ f, onChange, onToggleDay }: { f: ScheduleForm; onChange: (p: Partial<ScheduleForm>) => void; onToggleDay: (d: number) => void }) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Schedule Name *</label>
          <input value={f.name} onChange={e => onChange({ name: e.target.value })} placeholder="Morning Shift (8am-5pm)" className="w-full border rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Schedule Type</label>
          <select value={f.scheduleType} onChange={e => onChange({ scheduleType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
            {Object.keys(SCHEDULE_TYPE_LABELS).map(k => <option key={k} value={k}>{SCHEDULE_TYPE_LABELS[k]}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-3 p-3 rounded-lg border bg-white cursor-pointer">
            <input type="checkbox" checked={f.requireSelfieOnClockIn} onChange={e => onChange({ requireSelfieOnClockIn: e.target.checked })} className="h-4 w-4" />
            <div>
              <p className="text-sm font-medium text-gray-800">Require selfie on clock-in</p>
              <p className="text-xs text-gray-500">Employees on this schedule must capture a selfie when clocking in.</p>
            </div>
          </label>
        </div>
        <div><label className="text-xs font-semibold text-gray-600 block mb-1">Time In</label><input type="time" value={f.timeIn} onChange={e => onChange({ timeIn: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs font-semibold text-gray-600 block mb-1">Time Out</label><input type="time" value={f.timeOut} onChange={e => onChange({ timeOut: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs font-semibold text-gray-600 block mb-1">Hours / Day</label><input type="number" min={1} max={24} step={0.5} value={f.workHoursPerDay} onChange={e => onChange({ workHoursPerDay: Math.max(1, Number(e.target.value) || 8) })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-600">Break</label>
            <button type="button" onClick={() => onChange({ breakEnabled: !f.breakEnabled })} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${f.breakEnabled ? 'bg-[#2E4156]' : 'bg-slate-300'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${f.breakEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
          {f.breakEnabled ? (
            <>
              <input type="number" min={1} max={240} value={f.breakMinutes || 60} onChange={e => onChange({ breakMinutes: Math.max(1, Number(e.target.value)) })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <p className="text-[11px] text-gray-500 mt-1">{f.breakMinutes || 60}m allowed</p>
            </>
          ) : (
            <p className="text-[11px] text-amber-600">Break disabled for this schedule</p>
          )}
        </div>
        <div className="md:col-span-2"><DayPicker workDays={f.workDays} onToggle={onToggleDay} /></div>
      </div>
    )
  }

  async function saveFixedEmployee(employeeId: string) {
    const draft = fixedDrafts[employeeId]
    if (!draft) return
    setSavingFixedEmployeeId(employeeId)
    try {
      const selectedScheduleId = draft.scheduleId || null
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workScheduleId: selectedScheduleId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to update employee schedule')
        return
      }

      toast.success('Employee fixed schedule updated')
      await Promise.resolve(onRefresh())
      await loadFixedEmployees()
    } catch {
      toast.error('Failed to update employee schedule')
    } finally {
      setSavingFixedEmployeeId(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" /> Fixed Employee Assignment
            </CardTitle>
            <select
              value={fixedDeptFilter}
              onChange={e => setFixedDeptFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm text-gray-600"
            >
              <option value="">All Departments</option>
              {fixedDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingFixedEmployees ? (
            <div className="text-sm text-gray-400">Loading employees...</div>
          ) : fixedEmployees.length === 0 ? (
            <div className="text-sm text-gray-400">No employees found.</div>
          ) : (
            <div className="space-y-2">
              {fixedEmployees.map(emp => {
                const draft = fixedDrafts[emp.id] ?? { scheduleId: emp.workScheduleId ?? '', dayOffDays: [] }
                return (
                  <div key={emp.id} className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-2 items-center border rounded-xl p-2.5">
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{fullName(emp)}</p>
                      <p className="text-[10px] text-gray-400">{emp.department?.name ?? 'No Dept'}</p>
                    </div>
                    <select
                      value={draft.scheduleId}
                      onChange={e => {
                        const scheduleId = e.target.value
                        const workDays = schedules.find(s => s.id === scheduleId)?.workDays
                        setFixedDrafts(prev => ({
                          ...prev,
                          [emp.id]: { scheduleId, dayOffDays: scheduleId ? deriveDayOffDaysFromWorkDays(workDays) : [] },
                        }))
                      }}
                      className="border rounded-lg px-3 py-2 text-xs text-gray-700"
                    >
                      <option value="">No Fixed Schedule</option>
                      {schedules.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.timeIn && s.timeOut ? ` (${s.timeIn}-${s.timeOut})` : ''}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={() => saveFixedEmployee(emp.id)}
                      disabled={savingFixedEmployeeId === emp.id}
                      className="text-white"
                      style={{ background: '#fa5e01' }}
                    >
                      {savingFixedEmployeeId === emp.id ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {externalShowForm && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader><CardTitle className="text-sm text-orange-800">New Work Hours</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={addSchedule} className="space-y-4">
              <FormFields f={form} onChange={patch => setForm(prev => ({ ...prev, ...patch }))} onToggleDay={d => toggleDay(d, false)} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onFormClose}>Cancel</Button>
                <Button type="submit" disabled={saving} className="text-white" style={{ background: '#fa5e01' }}>{saving ? 'Adding...' : 'Add Schedule'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

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
