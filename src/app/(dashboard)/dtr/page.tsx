'use client'

import { Fragment, useMemo, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  compareDesc,
  compareAsc,
} from 'date-fns'
import {
  Plus,
  Check,
  X,
  Search,
  Trash2,
  ChevronDown,
  ChevronRight,
  CalendarRange,
  Users,
  CheckCheck,
  Clock,
  ZoomIn,
  MapPin,
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'

interface DTRRecord {
  id: string
  employeeId: string
  date: string
  timeIn: string | null
  timeOut: string | null
  breakIn: string | null
  breakOut: string | null
  regularHours: number | null
  overtimeHours: number | null
  nightDiffHours: number | null
  lateMinutes: number | null
  undertimeMinutes: number | null
  isAbsent: boolean
  isRestDay: boolean
  isHoliday: boolean
  holidayType: string | null
  isLeave: boolean
  approvedBy: string | null
  remarks: string | null
  clockInLat: number | null
  clockInLng: number | null
  clockInAddress: string | null
  clockOutLat: number | null
  clockOutLng: number | null
  clockOutAddress: string | null
  employee: {
    firstName: string
    lastName: string
    employeeNo: string
    department: { name: string } | null
  }
  screenCaptureCount?: number
  screenCaptures?: {
    id: string
    imageDataUrl: string
    capturedAt: string
  }[]
}

interface Employee {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
}

interface WeeklyGroup {
  key: string
  employeeId: string
  employeeName: string
  employeeNo: string
  department: string
  weekStart: Date
  weekEnd: Date
  records: DTRRecord[]
  totalRegular: number
  totalOvertime: number
  totalNightDiff: number
  totalLate: number
  totalUndertime: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'MIXED'
}

interface WeekOption {
  start: string
  end: string
  recordCount: number
  employeeCount: number
}

interface CompanyOption {
  id: string
  name: string
}

const STATUS_BADGE: Record<WeeklyGroup['status'], string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  MIXED: 'bg-indigo-100 text-indigo-800',
}

const DAILY_STATUS_BADGE: Record<'PENDING' | 'APPROVED' | 'REJECTED', string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}


function dailyStatus(record: DTRRecord): 'PENDING' | 'APPROVED' | 'REJECTED' {
  if (record.approvedBy) return 'APPROVED'
  if (record.remarks === 'REJECTED') return 'REJECTED'
  return 'PENDING'
}

function weekStatus(records: DTRRecord[]): WeeklyGroup['status'] {
  let pending = 0
  let approved = 0
  let rejected = 0
  for (const r of records) {
    const s = dailyStatus(r)
    if (s === 'PENDING') pending++
    if (s === 'APPROVED') approved++
    if (s === 'REJECTED') rejected++
  }
  if (pending > 0 && approved === 0 && rejected === 0) return 'PENDING'
  if (pending === 0 && approved > 0 && rejected === 0) return 'APPROVED'
  if (pending === 0 && rejected > 0 && approved === 0) return 'REJECTED'
  return 'MIXED'
}

function formatTime(dt: string | null): string {
  if (!dt) return '-'
  try {
    return format(parseISO(dt), 'HH:mm')
  } catch {
    return '-'
  }
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}hr` : `${h}hr ${m}m`
}

function calcBreakDuration(breakIn: string | null, breakOut: string | null): number {
  if (!breakIn || !breakOut) return 0
  try {
    const diff = (new Date(breakOut).getTime() - new Date(breakIn).getTime()) / (1000 * 60 * 60)
    return diff > 0 ? parseFloat(diff.toFixed(2)) : 0
  } catch {
    return 0
  }
}

function formatLocation(address: string | null, lat: number | null, lng: number | null): string | null {
  if (address && address.trim()) return address.trim()
  if (lat == null || lng == null) return null
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}


export default function DTRPage() {
  const now = new Date()
  const initialWeekStart = useMemo(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), [])
  const [isSystemAdmin, setIsSystemAdmin] = useState(false)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [records, setRecords] = useState<DTRRecord[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [expandedCaptureRows, setExpandedCaptureRows] = useState<Record<string, boolean>>({})
  const [captureRows, setCaptureRows] = useState<Record<string, Array<{ id: string; imageDataUrl: string; capturedAt: string }>>>({})
  const [captureLoading, setCaptureLoading] = useState<Record<string, boolean>>({})
  const [lightbox, setLightbox] = useState<{ src: string; label: string } | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approvingAll, setApprovingAll] = useState(false)
  const [editRecord, setEditRecord] = useState<DTRRecord | null>(null)
  const [editForm, setEditForm] = useState({ timeIn: '', timeOut: '', breakIn: '', breakOut: '', remarks: '' })
  const [editSaving, setEditSaving] = useState(false)
  const portalTarget = typeof document !== 'undefined' ? document.body : null
  const companyQuery = useMemo(
    () => (selectedCompanyId ? `companyId=${encodeURIComponent(selectedCompanyId)}` : ''),
    [selectedCompanyId]
  )
  const withCompanyQuery = useCallback(
    (url: string) => (companyQuery ? `${url}${url.includes('?') ? '&' : '?'}${companyQuery}` : url),
    [companyQuery]
  )

  const [form, setForm] = useState({
    employeeId: '',
    date: format(now, 'yyyy-MM-dd'),
    timeIn: '08:00',
    timeOut: '17:00',
    regularHours: 8,
    overtimeHours: 0,
    nightDiffHours: 0,
    lateMinutes: 0,
    undertimeMinutes: 0,
    isAbsent: false,
    isRestDay: false,
    isHoliday: false,
    remarks: '',
  })

  function calcOvertime(timeIn: string, timeOut: string, regularHours: number) {
    if (!timeIn || !timeOut) return 0
    const [inH, inM] = timeIn.split(':').map(Number)
    const [outH, outM] = timeOut.split(':').map(Number)
    if (!Number.isFinite(inH) || !Number.isFinite(inM) || !Number.isFinite(outH) || !Number.isFinite(outM)) return 0
    const start = inH * 60 + inM
    const end = outH * 60 + outM
    if (end <= start) return 0
    const workedHours = (end - start) / 60
    const breakHours = 1
    const netHours = Math.max(0, workedHours - breakHours)
    const ot = netHours - (regularHours || 0)
    return ot > 0 ? parseFloat(ot.toFixed(2)) : 0
  }

  useEffect(() => {
    if (!form.timeIn || !form.timeOut) return
    const ot = calcOvertime(form.timeIn, form.timeOut, form.regularHours)
    setForm(prev => (prev.overtimeHours === ot ? prev : { ...prev, overtimeHours: ot }))
  }, [form.timeIn, form.timeOut, form.regularHours])

  useEffect(() => {
    let active = true
    async function bootstrap() {
      try {
        const meRes = await fetch('/api/users/me')
        const meData = await meRes.json().catch(() => ({}))
        const actorRole = String(meData.actorRole ?? meData.role ?? '')
        const systemAdmin = actorRole === 'SUPER_ADMIN'
        if (!active) return
        setIsSystemAdmin(systemAdmin)
        if (!systemAdmin) return

        const companiesRes = await fetch('/api/admin/companies')
        const companiesData = await companiesRes.json().catch(() => ({}))
        const rows = ((companiesData.companies ?? []) as Array<{ id: string; name: string }>)
          .map(c => ({ id: c.id, name: c.name }))
        if (!active) return
        setCompanies(rows)
        setSelectedCompanyId(prev => prev || rows[0]?.id || '')
      } catch {
        // no-op
      }
    }
    void bootstrap()
    return () => {
      active = false
    }
  }, [])

  const loadWeeks = useCallback(async (preferredWeek?: string) => {
    if (isSystemAdmin && !selectedCompanyId) {
      setWeekOptions([])
      setSelectedWeek('')
      return
    }
    const res = await fetch(withCompanyQuery('/api/dtr/weeks?completed=1'))
    const data = await res.json().catch(() => ({}))
    const weeks = (data.weeks ?? []) as WeekOption[]
    setWeekOptions(weeks)

    const hasPreferred = preferredWeek && weeks.some(w => w.start === preferredWeek)
    const hasCurrent = selectedWeek && weeks.some(w => w.start === selectedWeek)
    const fallback = weeks[0]?.start ?? ''
    const nextWeek = hasPreferred ? preferredWeek! : hasCurrent ? selectedWeek : fallback
    if (nextWeek !== selectedWeek) {
      setSelectedWeek(nextWeek)
    }
  }, [isSystemAdmin, selectedCompanyId, selectedWeek, withCompanyQuery])

  const load = useCallback(async () => {
    if (!selectedWeek || (isSystemAdmin && !selectedCompanyId)) {
      setRecords([])
      return
    }
    setLoading(true)
    try {
      const ws = parseISO(selectedWeek)
      const we = endOfWeek(ws, { weekStartsOn: 1 })
      const from = format(ws, 'yyyy-MM-dd')
      const to = format(we, 'yyyy-MM-dd')
      const res = await fetch(withCompanyQuery(`/api/dtr?from=${from}&to=${to}&limit=1000&completed=1`))
      const data = await res.json().catch(() => ({}))
      setRecords((data.records ?? []) as DTRRecord[])
    } finally {
      setLoading(false)
    }
  }, [isSystemAdmin, selectedCompanyId, selectedWeek, withCompanyQuery])

  async function loadEmployees() {
    if (isSystemAdmin && !selectedCompanyId) {
      setEmployees([])
      return
    }
    const res = await fetch(withCompanyQuery('/api/employees?limit=200'))
    const data = await res.json().catch(() => ({}))
    setEmployees(data.employees ?? [])
  }

  useEffect(() => {
    void loadWeeks(initialWeekStart)
  }, [initialWeekStart, loadWeeks])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadEmployees()
  }, [isSystemAdmin, selectedCompanyId, withCompanyQuery])

  const groups = useMemo(() => {
    const map = new Map<string, WeeklyGroup>()
    for (const r of records) {
      const d = new Date(r.date)
      const ws = startOfWeek(d, { weekStartsOn: 1 })
      const we = endOfWeek(d, { weekStartsOn: 1 })
      const key = `${r.employeeId}|${format(ws, 'yyyy-MM-dd')}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          employeeId: r.employeeId,
          employeeName: `${r.employee.lastName}, ${r.employee.firstName}`,
          employeeNo: r.employee.employeeNo,
          department: r.employee.department?.name ?? '-',
          weekStart: ws,
          weekEnd: we,
          records: [],
          totalRegular: 0,
          totalOvertime: 0,
          totalNightDiff: 0,
          totalLate: 0,
          totalUndertime: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          status: 'PENDING',
        })
      }
      const g = map.get(key)!
      g.records.push(r)
      g.totalRegular += Number(r.regularHours ?? 0)
      g.totalOvertime += Number(r.overtimeHours ?? 0)
      g.totalNightDiff += Number(r.nightDiffHours ?? 0)
      g.totalLate += Number(r.lateMinutes ?? 0)
      g.totalUndertime += Number(r.undertimeMinutes ?? 0)
      const s = dailyStatus(r)
      if (s === 'PENDING') g.pendingCount += 1
      if (s === 'APPROVED') g.approvedCount += 1
      if (s === 'REJECTED') g.rejectedCount += 1
    }

    const result = Array.from(map.values()).map(g => {
      g.records.sort((a, b) => compareAsc(new Date(a.date), new Date(b.date)))
      g.status = weekStatus(g.records)
      return g
    })

    const q = search.trim().toLowerCase()
    const filtered = q
      ? result.filter(g =>
          g.employeeName.toLowerCase().includes(q) ||
          g.employeeNo.toLowerCase().includes(q) ||
          g.department.toLowerCase().includes(q),
        )
      : result

    return filtered.sort((a, b) => {
      const d = compareDesc(a.weekStart, b.weekStart)
      if (d !== 0) return d
      return a.employeeName.localeCompare(b.employeeName)
    })
  }, [records, search])

  async function submitForm() {
    if (!form.employeeId) {
      toast.error('Select an employee')
      return
    }
    const res = await fetch(withCompanyQuery('/api/dtr'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      toast.success('DTR record saved')
      setShowForm(false)
      const weekStart = format(startOfWeek(parseISO(form.date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      await loadWeeks(weekStart)
      await load()
    } else {
      toast.error('Failed to save record')
    }
  }

  async function approveRecord(id: string, action: 'APPROVED' | 'REJECTED') {
    setApprovingId(id)
    try {
      const res = await fetch(withCompanyQuery(`/api/dtr/${id}/approve`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) { toast.error('Failed to update record'); return }
      await load()
    } finally {
      setApprovingId(null)
    }
  }

  async function approveEmployeeWeek(group: WeeklyGroup, action: 'APPROVED' | 'REJECTED') {
    const res = await fetch(withCompanyQuery('/api/dtr/weekly-approve'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: group.employeeId,
        weekStart: format(group.weekStart, 'yyyy-MM-dd'),
        weekEnd: format(group.weekEnd, 'yyyy-MM-dd'),
        action,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? 'Failed'); return }
    toast.success(action === 'APPROVED' ? 'Week approved' : 'Week rejected')
    await loadWeeks()
    await load()
  }

  async function approveAll() {
    if (!selectedWeek) return
    setApprovingAll(true)
    try {
      const ws = parseISO(selectedWeek)
      const we = endOfWeek(ws, { weekStartsOn: 1 })
      const res = await fetch(withCompanyQuery('/api/dtr/approve-all'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart: format(ws, 'yyyy-MM-dd'),
          weekEnd: format(we, 'yyyy-MM-dd'),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to approve all'); return }
      toast.success(`Approved ${data.updated} record${data.updated !== 1 ? 's' : ''}`)
      await loadWeeks()
      await load()
    } finally {
      setApprovingAll(false)
    }
  }

  function requestDelete(id: string) {
    setDeleteId(id)
    setDeleteInput('')
    setShowDelete(true)
  }

  function openEdit(r: DTRRecord) {
    const toLocal = (iso: string | null) => {
      if (!iso) return ''
      const d = new Date(iso)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    setEditRecord(r)
    setEditForm({
      timeIn: toLocal(r.timeIn),
      timeOut: toLocal(r.timeOut),
      breakIn: toLocal(r.breakIn),
      breakOut: toLocal(r.breakOut),
      remarks: r.remarks ?? '',
    })
  }

  async function saveEdit() {
    if (!editRecord) return
    setEditSaving(true)
    try {
      const toISO = (v: string) => v ? new Date(v).toISOString().slice(0, 16) : null
      const res = await fetch(withCompanyQuery(`/api/dtr/${editRecord.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeIn: toISO(editForm.timeIn),
          timeOut: toISO(editForm.timeOut),
          breakIn: toISO(editForm.breakIn),
          breakOut: toISO(editForm.breakOut),
          remarks: editForm.remarks || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed to save'); return }
      toast.success('DTR record updated')
      setEditRecord(null)
      await load()
    } finally {
      setEditSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    if (deleteInput !== 'DELETE') {
      toast.error('Please type DELETE to confirm')
      return
    }
    const res = await fetch(withCompanyQuery(`/api/dtr/${deleteId}`), { method: 'DELETE' })
    if (res.ok) {
      toast.success('DTR record deleted')
      setShowDelete(false)
      setDeleteId(null)
      setDeleteInput('')
      await loadWeeks()
      await load()
    } else {
      toast.error('Failed to delete record')
    }
  }

  function toggleExpand(key: string) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function toggleCaptureRow(recordId: string) {
    const willOpen = !expandedCaptureRows[recordId]
    setExpandedCaptureRows(prev => ({ ...prev, [recordId]: willOpen }))
    if (!willOpen || captureRows[recordId]) return

    setCaptureLoading(prev => ({ ...prev, [recordId]: true }))
    try {
      const res = await fetch(withCompanyQuery(`/api/dtr/${recordId}/captures?limit=24`))
      const data = await res.json().catch(() => ({}))
      setCaptureRows(prev => ({ ...prev, [recordId]: (data.captures ?? []) as Array<{ id: string; imageDataUrl: string; capturedAt: string }> }))
    } catch {
      toast.error('Failed to load screenshots')
    } finally {
      setCaptureLoading(prev => ({ ...prev, [recordId]: false }))
    }
  }

  const totalPendingWeeks = groups.filter(g => g.pendingCount > 0).length
  const selectedWeekLabel = useMemo(() => {
    const w = weekOptions.find(x => x.start === selectedWeek)
    if (!w) return null
    return `${format(parseISO(w.start), 'MMM d')} - ${format(parseISO(w.end), 'MMM d, yyyy')}`
  }, [weekOptions, selectedWeek])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Time Sheets</h1>
          <p className="text-gray-500 text-sm mt-1">Grouped by employee and week with weekly approval</p>
        </div>
        <Button onClick={() => setShowForm(true)} disabled={isSystemAdmin && !selectedCompanyId}>
          <Plus className="w-4 h-4 mr-2" />
          Add DTR Entry
        </Button>
      </div>

      {showForm && portalTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <Card className="relative w-full max-w-4xl border-[#AAB7B7] shadow-2xl">
            <CardHeader>
              <CardTitle className="text-base">New DTR Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Employee *</label>
                  <select
                    value={form.employeeId}
                    onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Select employee...</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.lastName}, {e.firstName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Date *</label>
                  <DatePicker value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 block mb-1">Time In</label>
                    <Input type="time" value={form.timeIn} onChange={e => setForm(f => ({ ...f, timeIn: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 block mb-1">Time Out</label>
                    <Input type="time" value={form.timeOut} onChange={e => setForm(f => ({ ...f, timeOut: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Regular Hours</label>
                  <Input type="number" min={0} max={24} step={0.5} value={form.regularHours} onChange={e => setForm(f => ({ ...f, regularHours: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">OT Hours</label>
                  <Input type="number" min={0} max={12} step={0.5} value={form.overtimeHours} onChange={e => setForm(f => ({ ...f, overtimeHours: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Late (min)</label>
                  <Input type="number" min={0} value={form.lateMinutes} onChange={e => setForm(f => ({ ...f, lateMinutes: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Undertime (min)</label>
                  <Input type="number" min={0} value={form.undertimeMinutes} onChange={e => setForm(f => ({ ...f, undertimeMinutes: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="flex gap-4">
                {[
                  { key: 'isAbsent', label: 'Absent' },
                  { key: 'isRestDay', label: 'Rest Day' },
                  { key: 'isHoliday', label: 'Holiday' },
                ].map(c => (
                  <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form[c.key as keyof typeof form] as boolean}
                      onChange={e => setForm(f => ({ ...f, [c.key]: e.target.checked }))}
                    />
                    {c.label}
                  </label>
                ))}
                <div className="flex-1">
                  <Input placeholder="Remarks (optional)" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={submitForm}>Save DTR Entry</Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        portalTarget,
      )}

      {editRecord && portalTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditRecord(null)} />
          <Card className="relative w-full max-w-md shadow-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Edit DTR Record</CardTitle>
                <button onClick={() => setEditRecord(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {editRecord.employee.firstName} {editRecord.employee.lastName} — {format(parseISO(editRecord.date), 'MMM d, yyyy')}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Clock In</label>
                  <input type="datetime-local" value={editForm.timeIn} onChange={e => setEditForm(f => ({ ...f, timeIn: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Clock Out</label>
                  <input type="datetime-local" value={editForm.timeOut} onChange={e => setEditForm(f => ({ ...f, timeOut: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Break Start</label>
                  <input type="datetime-local" value={editForm.breakIn} onChange={e => setEditForm(f => ({ ...f, breakIn: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Break End</label>
                  <input type="datetime-local" value={editForm.breakOut} onChange={e => setEditForm(f => ({ ...f, breakOut: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Remarks</label>
                <input type="text" value={editForm.remarks} onChange={e => setEditForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional note..." className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <p className="text-[11px] text-gray-400">Hours, late, and undertime will be automatically recomputed upon saving.</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditRecord(null)}>Cancel</Button>
                <Button disabled={editSaving} onClick={saveEdit} style={{ background: '#fa5e01' }} className="text-white">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        portalTarget,
      )}

      {showDelete && portalTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDelete(false)} />
          <Card className="relative w-full max-w-md border-red-200 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-base text-red-600">Delete DTR Record</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">This action cannot be undone. Type <strong>DELETE</strong> to confirm.</p>
              <Input value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder="Type DELETE" />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
                <Button className="bg-red-600 hover:bg-red-700" onClick={confirmDelete}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        portalTarget,
      )}

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          {isSystemAdmin && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Company</label>
              <select
                value={selectedCompanyId}
                onChange={e => setSelectedCompanyId(e.target.value)}
                className="w-72 border rounded px-3 py-2 text-sm bg-white"
              >
                {companies.length === 0 && <option value="">No companies found</option>}
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Week</label>
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value)}
              className="w-72 border rounded px-3 py-2 text-sm bg-white"
            >
              {weekOptions.length === 0 && <option value="">No weeks with DTR records</option>}
              {weekOptions.map(w => (
                <option key={w.start} value={w.start}>
                  {format(parseISO(w.start), 'MMM d')} - {format(parseISO(w.end), 'MMM d, yyyy')}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-48">
            <label className="text-xs font-medium text-gray-600 block mb-1">Search Employee</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} className="pl-8" placeholder="Name, employee no, department..." />
            </div>
          </div>
        </CardContent>
      </Card>

            <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Weekly Time Sheets
              <Badge variant="outline">{groups.length} employee-weeks</Badge>
              <Badge className="bg-yellow-100 text-yellow-800">{totalPendingWeeks} pending weeks</Badge>
              {selectedWeekLabel && <Badge variant="outline">{selectedWeekLabel}</Badge>}
            </CardTitle>
            {selectedWeek && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                disabled={approvingAll}
                onClick={approveAll}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {approvingAll ? 'Approving...' : 'Approve All'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : groups.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No weekly time sheets found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Employee</th>
                    <th className="text-left p-3 font-medium text-gray-600">Week</th>
                    <th className="text-left p-3 font-medium text-gray-600">Department</th>
                    <th className="text-right p-3 font-medium text-gray-600">Reg Hrs</th>
                    <th className="text-right p-3 font-medium text-gray-600">OT Hrs</th>
                    <th className="text-right p-3 font-medium text-gray-600">ND Hrs</th>
                    <th className="text-right p-3 font-medium text-gray-600">Late</th>
                    <th className="text-right p-3 font-medium text-gray-600">Undertime</th>
                    <th className="text-center p-3 font-medium text-gray-600">Status</th>
                    <th className="text-center p-3 font-medium text-gray-600">Approve Week</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => {
                    const isOpen = !!expanded[group.key]
                    return (
                      <Fragment key={group.key}>
                        <tr
                          className="border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleExpand(group.key)}
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {isOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                              <div>
                                <div className="font-medium">{group.employeeName}</div>
                                <div className="text-xs text-gray-400">{group.employeeNo}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 text-xs text-gray-700">
                              <CalendarRange className="w-3.5 h-3.5" />
                              {format(group.weekStart, 'MMM d')} - {format(group.weekEnd, 'MMM d, yyyy')}
                            </div>
                          </td>
                          <td className="p-3 text-gray-600">{group.department}</td>
                          <td className="p-3 text-right">{group.totalRegular.toFixed(2)}h</td>
                          <td className="p-3 text-right">{group.totalOvertime > 0 ? `${group.totalOvertime.toFixed(2)}h` : '-'}</td>
                          <td className="p-3 text-right">
                            {group.totalNightDiff > 0
                              ? <span className="text-indigo-700 font-medium">{group.totalNightDiff.toFixed(2)}h</span>
                              : '-'}
                          </td>
                          <td className="p-3 text-right">
                            {group.totalLate > 0
                              ? <span className="text-red-600 font-medium">{formatMinutes(group.totalLate)}</span>
                              : '-'}
                          </td>
                          <td className="p-3 text-right">
                            {group.totalUndertime > 0
                              ? <span className="text-amber-600 font-medium">{formatMinutes(group.totalUndertime)}</span>
                              : '-'}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[group.status]}`}>
                              {group.status}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1 justify-center" onClick={e => e.stopPropagation()}>
                              {group.pendingCount > 0 ? (
                                <>
                                  <Button size="sm" variant="outline" className="h-7 text-green-600" onClick={() => approveEmployeeWeek(group, 'APPROVED')}>
                                    <Check className="w-3 h-3 mr-1" />
                                    Approve
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-red-600" onClick={() => approveEmployeeWeek(group, 'REJECTED')}>
                                    <X className="w-3 h-3 mr-1" />
                                    Reject
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b bg-gray-50/60">
                            <td colSpan={10} className="p-0">
                              <div className="px-4 py-3">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500 border-b border-gray-200">
                                      <th className="text-left py-2 pr-3">Date</th>
                                      <th className="text-center py-2 px-2">Clock In</th>
                                      <th className="text-center py-2 px-2">Clock Out</th>
                                      <th className="text-center py-2 px-2">Break</th>
                                      <th className="text-right py-2 px-2">Break Hrs</th>
                                      <th className="text-right py-2 px-2">Reg Hrs</th>
                                      <th className="text-right py-2 px-2">OT Hrs</th>
                                      <th className="text-right py-2 px-2">ND Hrs</th>
                                      <th className="text-right py-2 px-2">Late</th>
                                      <th className="text-right py-2 px-2">Undertime</th>
                                      <th className="text-center py-2 px-2">Status</th>
                                      <th className="text-center py-2">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.records.map(r => {
                                      const st = dailyStatus(r)
                                      const isApproving = approvingId === r.id
                                      const captureCount = Number(r.screenCaptureCount ?? r.screenCaptures?.length ?? 0)
                                      const showCaptures = !!expandedCaptureRows[r.id]
                                      const rowCaptures = captureRows[r.id] ?? []
                                      const rowCapturesLoading = !!captureLoading[r.id]
                                      const clockInLocation = formatLocation(r.clockInAddress, r.clockInLat, r.clockInLng)
                                      const clockOutLocation = formatLocation(r.clockOutAddress, r.clockOutLat, r.clockOutLng)
                                      const hasLocation = !!clockInLocation || !!clockOutLocation
                                      const lateMin = Number(r.lateMinutes ?? 0)
                                      const undertimeMin = Number(r.undertimeMinutes ?? 0)
                                      const nightDiff = Number(r.nightDiffHours ?? 0)
                                      const breakHrs = calcBreakDuration(r.breakIn, r.breakOut)
                                      return (
                                        <Fragment key={r.id}>
                                          <tr className="border-t border-gray-200/70 hover:bg-white/60">
                                            <td className="py-2 pr-3">
                                              <div className="font-medium">{format(new Date(r.date), 'EEE, MMM d')}</div>
                                              {r.isRestDay && <span className="text-[10px] bg-gray-200 text-gray-600 px-1 rounded">Rest Day</span>}
                                              {r.isHoliday && (
                                                <span className={`text-[10px] px-1 rounded ${r.holidayType === 'REGULAR' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                                  {r.holidayType === 'REGULAR' ? 'Regular Holiday' : 'Special Holiday'}
                                                </span>
                                              )}
                                              {r.isLeave && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">On Leave</span>}
                                            </td>
                                            <td className="py-2 px-2 text-center font-mono">
                                              {r.isAbsent ? (
                                                <span className="text-red-600 font-semibold">ABSENT</span>
                                              ) : (
                                                <div>
                                                  <span className={lateMin > 0 ? 'text-red-600 font-semibold' : 'text-gray-800'}>
                                                    {formatTime(r.timeIn)}
                                                  </span>
                                                  {lateMin > 0 && (
                                                    <div className="text-[10px] text-red-500 font-medium">+{formatMinutes(lateMin)} late</div>
                                                  )}
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-2 px-2 text-center font-mono">
                                              {r.isAbsent ? '-' : (
                                                <div>
                                                  <span className={undertimeMin > 0 ? 'text-amber-600 font-semibold' : 'text-gray-800'}>
                                                    {formatTime(r.timeOut)}
                                                  </span>
                                                  {undertimeMin > 0 && (
                                                    <div className="text-[10px] text-amber-500 font-medium">-{formatMinutes(undertimeMin)} early</div>
                                                  )}
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-2 px-2 text-center font-mono text-gray-500">
                                              {r.breakIn && r.breakOut
                                                ? <span>{formatTime(r.breakIn)} – {formatTime(r.breakOut)}</span>
                                                : r.breakIn
                                                  ? <span className="text-amber-500">{formatTime(r.breakIn)} (ongoing)</span>
                                                  : <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="py-2 px-2 text-right text-gray-500">
                                              {breakHrs > 0 ? `${breakHrs.toFixed(2)}h` : '—'}
                                            </td>
                                            <td className="py-2 px-2 text-right font-medium">{Number(r.regularHours ?? 0).toFixed(2)}h</td>
                                            <td className="py-2 px-2 text-right">
                                              {Number(r.overtimeHours ?? 0) > 0
                                                ? <span className="text-blue-700 font-medium">{Number(r.overtimeHours).toFixed(2)}h</span>
                                                : <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="py-2 px-2 text-right">
                                              {nightDiff > 0
                                                ? <span className="text-indigo-700 font-medium">{nightDiff.toFixed(2)}h</span>
                                                : <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="py-2 px-2 text-right">
                                              {lateMin > 0
                                                ? <span className="text-red-600 font-semibold">{formatMinutes(lateMin)}</span>
                                                : <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="py-2 px-2 text-right">
                                              {undertimeMin > 0
                                                ? <span className="text-amber-600 font-semibold">{formatMinutes(undertimeMin)}</span>
                                                : <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${DAILY_STATUS_BADGE[st]}`}>{st}</span>
                                            </td>
                                            <td className="py-2 text-center">
                                              <div className="flex items-center justify-center gap-1">
                                                {st !== 'APPROVED' && (
                                                  <Button size="sm" variant="outline" className="h-6 w-6 p-0 text-green-600 hover:bg-green-50" disabled={isApproving} onClick={() => approveRecord(r.id, 'APPROVED')}>
                                                    <Check className="w-3 h-3" />
                                                  </Button>
                                                )}
                                                {st !== 'REJECTED' && (
                                                  <Button size="sm" variant="outline" className="h-6 w-6 p-0 text-red-600 hover:bg-red-50" disabled={isApproving} onClick={() => approveRecord(r.id, 'REJECTED')}>
                                                    <X className="w-3 h-3" />
                                                  </Button>
                                                )}
                                                <Button size="sm" variant="outline" className="h-6 w-6 p-0 text-blue-500 hover:bg-blue-50" onClick={() => openEdit(r)}>
                                                  <Pencil className="w-3 h-3" />
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-6 w-6 p-0 text-gray-400 hover:text-red-600" onClick={() => requestDelete(r.id)}>
                                                  <Trash2 className="w-3 h-3" />
                                                </Button>
                                              </div>
                                            </td>
                                          </tr>
                                          {hasLocation && (
                                            <tr className="bg-blue-50/40">
                                              <td colSpan={12} className="px-4 py-1.5">
                                                <div className="flex flex-col gap-1.5 text-[11px] text-slate-700">
                                                  {clockInLocation && (
                                                    <div className="flex items-start gap-1.5">
                                                      <MapPin className="w-3 h-3 mt-0.5 text-blue-600 shrink-0" />
                                                      <span>
                                                        <span className="font-semibold text-slate-800">Clock In Location:</span>{' '}
                                                        {clockInLocation}
                                                      </span>
                                                    </div>
                                                  )}
                                                  {clockOutLocation && (
                                                    <div className="flex items-start gap-1.5">
                                                      <MapPin className="w-3 h-3 mt-0.5 text-blue-600 shrink-0" />
                                                      <span>
                                                        <span className="font-semibold text-slate-800">Clock Out Location:</span>{' '}
                                                        {clockOutLocation}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                          {captureCount > 0 && (
                                            <tr className="bg-orange-50/40">
                                              <td colSpan={12} className="px-4 py-1.5">
                                                <button
                                                  type="button"
                                                  onClick={() => { void toggleCaptureRow(r.id) }}
                                                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-semibold transition-colors"
                                                >
                                                  <ZoomIn className="w-3 h-3" />
                                                  {showCaptures ? 'Hide' : `${captureCount} Screenshot${captureCount !== 1 ? 's' : ''}`}
                                                </button>
                                              </td>
                                            </tr>
                                          )}
                                          {showCaptures && captureCount > 0 && (
                                            <tr className="bg-white/70">
                                              <td colSpan={12} className="pb-3 px-4 pt-0">
                                                {rowCapturesLoading ? (
                                                  <div className="text-xs text-gray-500 py-2">Loading screenshots...</div>
                                                ) : (
                                                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                                    {rowCaptures.map(sc => (
                                                    <div
                                                      key={sc.id}
                                                      className="group rounded-lg border border-gray-200 bg-white p-1 cursor-pointer hover:border-orange-400 hover:shadow-md transition-all"
                                                      onClick={() => setLightbox({ src: sc.imageDataUrl, label: format(new Date(sc.capturedAt), 'EEE, MMM d · hh:mm:ss a') })}
                                                      title="Click to enlarge"
                                                    >
                                                      <div className="relative overflow-hidden rounded">
                                                        <img
                                                          src={sc.imageDataUrl}
                                                          alt={`Screenshot ${format(new Date(sc.capturedAt), 'hh:mm a')}`}
                                                          className="w-full h-20 object-cover object-top rounded"
                                                        />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                                          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                                                        </div>
                                                      </div>
                                                      <p className="text-[10px] text-gray-500 mt-1 text-center">
                                                        {format(new Date(sc.capturedAt), 'hh:mm a')}
                                                      </p>
                                                    </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </td>
                                            </tr>
                                          )}
                                        </Fragment>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Screenshot lightbox */}
      {lightbox && portalTarget && createPortal(
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors text-lg"
            onClick={() => setLightbox(null)}
          >
            <X className="w-4 h-4" />
          </button>
          <img
            src={lightbox.src}
            alt="Screenshot enlarged"
            className="max-w-[calc(100%-48px)] max-h-[calc(100vh-120px)] rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <p className="text-sm text-white/60 font-medium">{lightbox.label}</p>
        </div>,
        portalTarget
      )}
    </div>
  )
}

