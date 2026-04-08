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
  FileDown,
  Clock,
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
  regularHours: number | null
  overtimeHours: number | null
  nightDiffHours: number | null
  lateMinutes: number | null
  undertimeMinutes: number | null
  isAbsent: boolean
  isRestDay: boolean
  approvedBy: string | null
  remarks: string | null
  employee: {
    firstName: string
    lastName: string
    employeeNo: string
    department: { name: string } | null
  }
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
  totalLate: number
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


export default function DTRPage() {
  const now = new Date()
  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [records, setRecords] = useState<DTRRecord[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [showForm, setShowForm] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approvingAll, setApprovingAll] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [showTardiness, setShowTardiness] = useState(false)
  const portalTarget = typeof document !== 'undefined' ? document.body : null

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

  const loadWeeks = useCallback(async (preferredWeek?: string) => {
    const res = await fetch('/api/dtr/weeks?completed=1')
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
  }, [selectedWeek])

  const load = useCallback(async () => {
    if (!selectedWeek) {
      setRecords([])
      return
    }
    setLoading(true)
    try {
      const ws = parseISO(selectedWeek)
      const we = endOfWeek(ws, { weekStartsOn: 1 })
      const from = format(ws, 'yyyy-MM-dd')
      const to = format(we, 'yyyy-MM-dd')
      const res = await fetch(`/api/dtr?from=${from}&to=${to}&limit=1000&completed=1`)
      const data = await res.json().catch(() => ({}))
      setRecords((data.records ?? []) as DTRRecord[])
    } finally {
      setLoading(false)
    }
  }, [selectedWeek])

  async function loadEmployees() {
    const res = await fetch('/api/employees?limit=200')
    const data = await res.json().catch(() => ({}))
    setEmployees(data.employees ?? [])
  }

  useEffect(() => {
    void loadWeeks(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    loadEmployees()
  }, [])

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
          totalLate: 0,
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
      g.totalLate += Number(r.lateMinutes ?? 0)
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
    const res = await fetch('/api/dtr', {
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
      const res = await fetch(`/api/dtr/${id}/approve`, {
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
    const res = await fetch('/api/dtr/weekly-approve', {
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
      const res = await fetch('/api/dtr/approve-all', {
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

  async function exportPdf() {
    if (!selectedWeek) return
    setExportingPdf(true)
    try {
      const ws = parseISO(selectedWeek)
      const we = endOfWeek(ws, { weekStartsOn: 1 })
      const url = `/api/dtr/tardiness-report?weekStart=${format(ws, 'yyyy-MM-dd')}&weekEnd=${format(we, 'yyyy-MM-dd')}`
      const res = await fetch(url)
      if (!res.ok) { toast.error('Failed to generate report'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `tardiness-${format(ws, 'yyyy-MM-dd')}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setExportingPdf(false)
    }
  }

  function requestDelete(id: string) {
    setDeleteId(id)
    setDeleteInput('')
    setShowDelete(true)
  }

  async function confirmDelete() {
    if (!deleteId) return
    if (deleteInput !== 'DELETE') {
      toast.error('Please type DELETE to confirm')
      return
    }
    const res = await fetch(`/api/dtr/${deleteId}`, { method: 'DELETE' })
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

  const tardinessRows = useMemo(() => {
    return groups
      .map(g => {
        const tardyDays = g.records.filter(r => Number(r.lateMinutes ?? 0) > 0 && !r.isAbsent)
        const totalLate = g.records.reduce((s, r) => s + Number(r.lateMinutes ?? 0), 0)
        const totalUndertime = g.records.reduce((s, r) => s + Number(r.undertimeMinutes ?? 0), 0)
        const absentDays = g.records.filter(r => r.isAbsent).length
        return {
          key: g.key,
          employeeName: g.employeeName,
          employeeNo: g.employeeNo,
          department: g.department,
          tardyDays: tardyDays.length,
          totalLate,
          totalUndertime,
          absentDays,
        }
      })
      .filter(r => r.tardyDays > 0 || r.absentDays > 0)
      .sort((a, b) => b.totalLate - a.totalLate)
  }, [groups])

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
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add DTR Entry
        </Button>
      </div>

      {showForm && portalTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <Card className="relative w-full max-w-4xl border-teal-200 shadow-2xl">
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

      {/* Tardiness Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-500" />
              Tardiness Summary
              {tardinessRows.length > 0 && (
                <Badge className="bg-red-100 text-red-700">{tardinessRows.length} employee{tardinessRows.length !== 1 ? 's' : ''}</Badge>
              )}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50"
                disabled={exportingPdf || !selectedWeek}
                onClick={exportPdf}
              >
                <FileDown className="w-3.5 h-3.5" />
                {exportingPdf ? 'Generating...' : 'Export PDF'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowTardiness(v => !v)}>
                {showTardiness ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {showTardiness ? 'Hide' : 'Show'}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showTardiness && (
          <CardContent className="p-0">
            {tardinessRows.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No tardiness or absences recorded for this week.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-red-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-600">Employee</th>
                      <th className="text-left p-3 font-medium text-gray-600">Department</th>
                      <th className="text-right p-3 font-medium text-gray-600">Tardy Days</th>
                      <th className="text-right p-3 font-medium text-gray-600">Total Late</th>
                      <th className="text-right p-3 font-medium text-gray-600">Avg Late/Day</th>
                      <th className="text-right p-3 font-medium text-gray-600">Undertime</th>
                      <th className="text-right p-3 font-medium text-gray-600">Absences</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tardinessRows.map(row => (
                      <tr key={row.key} className="border-b hover:bg-red-50/40">
                        <td className="p-3">
                          <div className="font-medium">{row.employeeName}</div>
                          <div className="text-xs text-gray-400">{row.employeeNo}</div>
                        </td>
                        <td className="p-3 text-gray-600">{row.department}</td>
                        <td className="p-3 text-right">
                          <span className={`font-semibold ${row.tardyDays >= 3 ? 'text-red-600' : row.tardyDays >= 2 ? 'text-orange-500' : 'text-yellow-600'}`}>
                            {row.tardyDays}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {row.totalLate > 0 ? (
                            <span className={`font-semibold ${row.totalLate >= 60 ? 'text-red-600' : 'text-orange-500'}`}>
                              {row.totalLate >= 60
                                ? `${Math.floor(row.totalLate / 60)}h ${row.totalLate % 60}m`
                                : `${row.totalLate}m`}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="p-3 text-right text-gray-600">
                          {row.tardyDays > 0 ? `${Math.round(row.totalLate / row.tardyDays)}m` : '—'}
                        </td>
                        <td className="p-3 text-right text-gray-600">
                          {row.totalUndertime > 0 ? `${row.totalUndertime}m` : '—'}
                        </td>
                        <td className="p-3 text-right">
                          {row.absentDays > 0 ? (
                            <span className="font-semibold text-red-600">{row.absentDays}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}
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
                    <th className="text-right p-3 font-medium text-gray-600">Late</th>
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
                          <td className="p-3 text-right">{group.totalLate > 0 ? `${group.totalLate}m` : '-'}</td>
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
                            <td colSpan={8} className="p-0">
                              <div className="px-4 py-3">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="text-left py-2">Date</th>
                                      <th className="text-left py-2">In / Out</th>
                                      <th className="text-right py-2">Reg</th>
                                      <th className="text-right py-2">OT</th>
                                      <th className="text-right py-2">Late</th>
                                      <th className="text-center py-2">Daily Status</th>
                                      <th className="text-center py-2">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.records.map(r => {
                                      const st = dailyStatus(r)
                                      const isApproving = approvingId === r.id
                                      return (
                                        <tr key={r.id} className="border-t border-gray-200/70">
                                          <td className="py-2">{format(new Date(r.date), 'EEE, MMM d')}</td>
                                          <td className="py-2 font-mono">
                                            {r.isAbsent
                                              ? <span className="text-red-600">ABSENT</span>
                                              : `${formatTime(r.timeIn)} / ${formatTime(r.timeOut)}`}
                                          </td>
                                          <td className="py-2 text-right">{Number(r.regularHours ?? 0).toFixed(2)}h</td>
                                          <td className="py-2 text-right">{Number(r.overtimeHours ?? 0) > 0 ? `${Number(r.overtimeHours).toFixed(2)}h` : '-'}</td>
                                          <td className="py-2 text-right">{Number(r.lateMinutes ?? 0) > 0 ? `${r.lateMinutes}m` : '-'}</td>
                                          <td className="py-2 text-center">
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
                                              <Button size="sm" variant="outline" className="h-6 w-6 p-0 text-gray-400 hover:text-red-600" onClick={() => requestDelete(r.id)}>
                                                <Trash2 className="w-3 h-3" />
                                              </Button>
                                            </div>
                                          </td>
                                        </tr>
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
    </div>
  )
}
