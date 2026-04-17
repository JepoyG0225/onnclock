'use client'
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Clock3,
  Plus,
  CheckCircle2,
  XCircle,
  Search,
  CalendarDays,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
  department?: { name: string } | null
  position?: { title: string } | null
}

interface OvertimeRequest {
  id: string
  employeeId: string
  date: string
  startTime: string
  endTime: string
  hours: number
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  approvedById?: string | null
  approvedAt?: string | null
  rejectionReason?: string | null
  createdAt: string
  employee: Employee
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HR_ROLES = new Set(['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN'])

function statusBadge(status: string) {
  if (status === 'PENDING') return 'bg-yellow-100 text-yellow-700'
  if (status === 'APPROVED') return 'bg-green-100 text-green-700'
  if (status === 'REJECTED') return 'bg-red-100 text-red-700'
  if (status === 'CANCELLED') return 'bg-gray-100 text-gray-500'
  return 'bg-gray-100 text-gray-500'
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OvertimePage() {
  const [requests, setRequests] = useState<OvertimeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)
  const isHR = userRole !== null && HR_ROLES.has(userRole)

  // New request dialog
  const [showCreate, setShowCreate] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employeeId: '',
    date: '',
    startTime: '',
    endTime: '',
    hours: '',
    reason: '',
  })

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectSaving, setRejectSaving] = useState(false)

  useEffect(() => {
    fetch('/api/users/me')
      .then(r => r.json())
      .then(d => setUserRole(d?.user?.role ?? d?.role ?? null))
      .catch(() => {})
  }, [])

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (activeTab !== 'ALL') params.set('status', activeTab)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/overtime-requests?${params}`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setRequests(data.requests)
    } catch {
      toast.error('Failed to load overtime requests')
    } finally {
      setLoading(false)
    }
  }, [activeTab, dateFrom, dateTo])

  useEffect(() => { loadRequests() }, [loadRequests])

  async function handleOpenCreate() {
    setShowCreate(true)
    if (employees.length === 0) {
      try {
        const res = await fetch('/api/employees?limit=200')
        if (res.ok) {
          const data = await res.json()
          setEmployees(data.employees ?? data.data ?? [])
        }
      } catch { /* ignore */ }
    }
  }

  async function handleCreate() {
    if (!form.employeeId || !form.date || !form.startTime || !form.endTime || !form.hours || !form.reason) {
      toast.error('Please fill in all required fields')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/overtime-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: form.employeeId,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          hours: parseFloat(form.hours),
          reason: form.reason,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create')
      }
      toast.success('Overtime request created')
      setShowCreate(false)
      setForm({ employeeId: '', date: '', startTime: '', endTime: '', hours: '', reason: '' })
      await loadRequests()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove(id: string) {
    try {
      const res = await fetch(`/api/overtime-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      })
      if (!res.ok) throw new Error('Failed to approve')
      toast.success('Overtime request approved')
      await loadRequests()
    } catch {
      toast.error('Failed to approve request')
    }
  }

  async function handleRejectConfirm() {
    if (!rejectTarget) return
    setRejectSaving(true)
    try {
      const res = await fetch(`/api/overtime-requests/${rejectTarget}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REJECTED', rejectionReason: rejectReason }),
      })
      if (!res.ok) throw new Error('Failed to reject')
      toast.success('Overtime request rejected')
      setRejectTarget(null)
      setRejectReason('')
      await loadRequests()
    } catch {
      toast.error('Failed to reject request')
    } finally {
      setRejectSaving(false)
    }
  }

  // Filter by employee search
  const filtered = requests.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    const name = `${r.employee.firstName} ${r.employee.lastName}`.toLowerCase()
    return name.includes(q) || r.employee.employeeNo.toLowerCase().includes(q)
  })

  const tabs = [
    { key: 'ALL', label: 'All' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'REJECTED', label: 'Rejected' },
  ] as const

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock3 className="w-6 h-6 text-[#fa5e01]" />
            Overtime Requests
          </h1>
          <p className="text-gray-500 mt-0.5 text-sm">Track and manage employee overtime hours</p>
        </div>
        {isHR && (
          <Button
            onClick={handleOpenCreate}
            className="bg-[#1A2D42] hover:bg-[#243d57] text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Request
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tab filter */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="pl-9 w-48"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gray-400" />
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-36 text-sm"
            placeholder="From"
          />
          <span className="text-gray-400 text-sm">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-36 text-sm"
            placeholder="To"
          />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo('') }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-2 border-[#fa5e01] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Clock3 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No overtime requests found</p>
              <p className="text-gray-400 text-sm mt-1">
                {activeTab !== 'ALL' ? `No ${activeTab.toLowerCase()} requests` : 'Create a new request to get started'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-4 font-semibold text-gray-600">Employee</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Department</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Date</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Time</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Hours</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Reason</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Status</th>
                    {isHR && <th className="text-center p-4 font-semibold text-gray-600">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(req => (
                    <tr key={req.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <p className="font-medium text-gray-900">
                          {req.employee.lastName}, {req.employee.firstName}
                        </p>
                        <p className="text-xs text-gray-400">{req.employee.employeeNo}</p>
                      </td>
                      <td className="p-4 text-gray-600">
                        {req.employee.department?.name ?? '—'}
                      </td>
                      <td className="p-4 text-gray-600">
                        {format(parseISO(req.date), 'MMM d, yyyy')}
                      </td>
                      <td className="p-4 text-gray-600 font-mono text-xs">
                        {req.startTime} – {req.endTime}
                      </td>
                      <td className="p-4 text-center font-semibold text-gray-800">
                        {req.hours}h
                      </td>
                      <td className="p-4 text-gray-600 max-w-[180px]">
                        <p className="truncate" title={req.reason}>{req.reason}</p>
                        {req.status === 'REJECTED' && req.rejectionReason && (
                          <p className="text-xs text-red-500 mt-0.5 truncate" title={req.rejectionReason}>
                            Rejected: {req.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <Badge className={`text-xs border-0 ${statusBadge(req.status)}`}>
                          {req.status.charAt(0) + req.status.slice(1).toLowerCase()}
                        </Badge>
                      </td>
                      {isHR && (
                        <td className="p-4 text-center">
                          {req.status === 'PENDING' && (
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                size="sm"
                                className="h-7 px-2.5 bg-green-600 hover:bg-green-700 text-white text-xs"
                                onClick={() => handleApprove(req.id)}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-red-600 border-red-200 hover:bg-red-50 text-xs"
                                onClick={() => { setRejectTarget(req.id); setRejectReason('') }}
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
                          {req.status === 'APPROVED' && (
                            <span className="text-xs text-green-600 font-medium">
                              {req.approvedAt ? format(new Date(req.approvedAt), 'MMM d') : 'Approved'}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary footer */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{filtered.length} request{filtered.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>
            Total: <strong className="text-gray-700">
              {filtered.reduce((sum, r) => sum + r.hours, 0).toFixed(1)}h
            </strong>
          </span>
          {activeTab === 'ALL' && (
            <>
              <span>·</span>
              <span>
                Pending: <strong className="text-yellow-600">
                  {filtered.filter(r => r.status === 'PENDING').length}
                </strong>
              </span>
            </>
          )}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock3 className="w-5 h-5 text-[#fa5e01]" />
              New Overtime Request
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee <span className="text-red-500">*</span>
              </label>
              <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.lastName}, {e.firstName} ({e.employeeNo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time <span className="text-red-500">*</span>
                </label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time <span className="text-red-500">*</span>
                </label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hours <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="0.5"
                  step="0.5"
                  max="24"
                  value={form.hours}
                  onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                  placeholder="e.g. 2.5"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <Input
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Reason for overtime…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="bg-[#1A2D42] hover:bg-[#243d57] text-white"
            >
              {saving ? 'Creating…' : 'Create Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={open => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" />
              Reject Overtime Request
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for rejection
            </label>
            <Input
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Optional reason…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              onClick={handleRejectConfirm}
              disabled={rejectSaving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {rejectSaving ? 'Rejecting…' : 'Reject Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
