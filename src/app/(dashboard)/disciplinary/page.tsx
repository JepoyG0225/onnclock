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
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, Plus, ChevronDown, ChevronUp, X } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

type DisciplinaryType =
  | 'NOTICE_TO_EXPLAIN'
  | 'NOTICE_OF_DECISION'
  | 'WRITTEN_WARNING'
  | 'SUSPENSION'
  | 'DEMOTION'
  | 'TERMINATION'

type DisciplinaryStatus = 'OPEN' | 'RESPONDED' | 'CLOSED'

interface Employee {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
  department?: { name: string } | null
  position?:   { title: string } | null
}

interface DisciplinaryRecord {
  id:             string
  type:           DisciplinaryType
  incident:       string
  description:    string
  dateOfIncident: string
  dateIssued:     string
  issuedBy:       string
  response:       string | null
  respondedAt:    string | null
  status:         DisciplinaryStatus
  createdAt:      string
  employee:       Employee
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<DisciplinaryType, string> = {
  NOTICE_TO_EXPLAIN:  'Notice to Explain',
  NOTICE_OF_DECISION: 'Notice of Decision',
  WRITTEN_WARNING:    'Written Warning',
  SUSPENSION:         'Suspension',
  DEMOTION:           'Demotion',
  TERMINATION:        'Termination',
}

const TYPE_COLORS: Record<DisciplinaryType, string> = {
  NOTICE_TO_EXPLAIN:  'bg-blue-100 text-blue-800',
  NOTICE_OF_DECISION: 'bg-gray-100 text-gray-700',
  WRITTEN_WARNING:    'bg-yellow-100 text-yellow-800',
  SUSPENSION:         'bg-orange-100 text-orange-800',
  DEMOTION:           'bg-purple-100 text-purple-800',
  TERMINATION:        'bg-red-100 text-red-800',
}

const STATUS_COLORS: Record<DisciplinaryStatus, string> = {
  OPEN:      'bg-red-100 text-red-700',
  RESPONDED: 'bg-yellow-100 text-yellow-800',
  CLOSED:    'bg-green-100 text-green-800',
}

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: 'all',       label: 'All' },
  { value: 'OPEN',      label: 'Open' },
  { value: 'RESPONDED', label: 'Responded' },
  { value: 'CLOSED',    label: 'Closed' },
]

const TYPE_OPTIONS: Array<{ value: DisciplinaryType; label: string }> = [
  { value: 'NOTICE_TO_EXPLAIN',  label: 'Notice to Explain' },
  { value: 'NOTICE_OF_DECISION', label: 'Notice of Decision' },
  { value: 'WRITTEN_WARNING',    label: 'Written Warning' },
  { value: 'SUSPENSION',         label: 'Suspension' },
  { value: 'DEMOTION',           label: 'Demotion' },
  { value: 'TERMINATION',        label: 'Termination' },
]

function fmt(d: string) {
  try { return format(new Date(d), 'MMM d, yyyy') } catch { return d }
}

// ─── Issue Dialog ─────────────────────────────────────────────────────────────

interface IssueDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function IssueDialog({ open, onClose, onCreated }: IssueDialogProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [saving, setSaving]       = useState(false)

  const [employeeId,    setEmployeeId]    = useState('')
  const [type,          setType]          = useState<DisciplinaryType | ''>('')
  const [incident,      setIncident]      = useState('')
  const [description,   setDescription]   = useState('')
  const [dateOfIncident, setDateOfIncident] = useState('')
  const [dateIssued,    setDateIssued]    = useState(format(new Date(), 'yyyy-MM-dd'))
  const [issuedBy,      setIssuedBy]      = useState('')

  useEffect(() => {
    if (!open) return
    fetch('/api/employees?limit=200')
      .then(r => r.json())
      .then(d => setEmployees(d.employees ?? d ?? []))
      .catch(() => {})
  }, [open])

  function resetForm() {
    setEmployeeId(''); setType(''); setIncident(''); setDescription('')
    setDateOfIncident(''); setDateIssued(format(new Date(), 'yyyy-MM-dd')); setIssuedBy('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!employeeId || !type || !incident || !description || !dateOfIncident || !dateIssued || !issuedBy) {
      toast.error('Please fill in all required fields')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/disciplinary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, type, incident, description, dateOfIncident, dateIssued, issuedBy }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to create record')
        return
      }
      toast.success('Disciplinary record issued')
      resetForm()
      onCreated()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { resetForm(); onClose() } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Issue Disciplinary Action</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Employee */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.lastName}, {emp.firstName} ({emp.employeeNo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
            <Select value={type} onValueChange={v => setType(v as DisciplinaryType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Incident */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Incident Title *</label>
            <Input
              value={incident}
              onChange={e => setIncident(e.target.value)}
              placeholder="Brief title of the incident"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detailed description of the incident..."
              rows={4}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Incident *</label>
              <Input
                type="date"
                value={dateOfIncident}
                onChange={e => setDateOfIncident(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Issued *</label>
              <Input
                type="date"
                value={dateIssued}
                onChange={e => setDateIssued(e.target.value)}
              />
            </div>
          </div>

          {/* Issued By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Issued By *</label>
            <Input
              value={issuedBy}
              onChange={e => setIssuedBy(e.target.value)}
              placeholder="Name of issuing HR officer"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { resetForm(); onClose() }}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              style={{ background: '#1A2D42' }}
            >
              {saving ? 'Issuing...' : 'Issue Action'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Detail Row ───────────────────────────────────────────────────────────────

interface DetailRowProps {
  record:  DisciplinaryRecord
  isHR:    boolean
  onClose: () => void
  onUpdate: () => void
}

function DetailRow({ record, isHR, onClose, onUpdate }: DetailRowProps) {
  const [saving, setSaving] = useState(false)

  async function markClosed() {
    setSaving(true)
    try {
      const res = await fetch(`/api/disciplinary/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' }),
      })
      if (!res.ok) {
        toast.error('Failed to close record')
        return
      }
      toast.success('Record closed')
      onUpdate()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <td colSpan={6} className="p-0">
        <div className="bg-gray-50 border-b px-6 py-5">
          <div className="flex items-start justify-between mb-4">
            <h4 className="font-semibold text-gray-800 text-base">{record.incident}</h4>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Timeline */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Details */}
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-gray-700 whitespace-pre-line">{record.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Issued By</p>
                  <p className="font-medium">{record.issuedBy}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Date Issued</p>
                  <p>{fmt(record.dateIssued)}</p>
                </div>
              </div>
            </div>

            {/* Response + Timeline */}
            <div className="space-y-3">
              {record.response ? (
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                    Employee Response
                    {record.respondedAt && (
                      <span className="ml-2 normal-case font-normal text-gray-400">
                        — {fmt(record.respondedAt)}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{record.response}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No employee response yet.</p>
              )}

              {/* Timeline */}
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Timeline</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                    <span>Incident on {fmt(record.dateOfIncident)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                    <span>{TYPE_LABELS[record.type]} issued on {fmt(record.dateIssued)}</span>
                  </div>
                  {record.respondedAt && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
                      <span>Employee responded on {fmt(record.respondedAt)}</span>
                    </div>
                  )}
                  {record.status === 'CLOSED' && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                      <span>Case closed</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          {isHR && record.status !== 'CLOSED' && (
            <div className="mt-4 pt-4 border-t flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={markClosed}
                disabled={saving}
                className="text-green-700 border-green-300 hover:bg-green-50"
              >
                {saving ? 'Closing...' : 'Mark as Closed'}
              </Button>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DisciplinaryPage() {
  const [records,      setRecords]      = useState<DisciplinaryRecord[]>([])
  const [loading,      setLoading]      = useState(true)
  const [isHR,         setIsHR]         = useState(false)
  const [statusTab,    setStatusTab]    = useState('all')
  const [typeFilter,   setTypeFilter]   = useState('all')
  const [search,       setSearch]       = useState('')
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [showIssue,    setShowIssue]    = useState(false)

  // Determine role
  useEffect(() => {
    fetch('/api/users/me')
      .then(r => r.json())
      .then(d => {
        const role = d.role ?? ''
        setIsHR(['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN'].includes(role))
      })
      .catch(() => {})
  }, [])

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusTab !== 'all') params.set('status', statusTab)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      const res = await fetch(`/api/disciplinary?${params.toString()}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setRecords(data.records ?? [])
    } catch {
      toast.error('Failed to load records')
    } finally {
      setLoading(false)
    }
  }, [statusTab, typeFilter])

  useEffect(() => { loadRecords() }, [loadRecords])

  // Client-side search filter
  const filtered = records.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    const name = `${r.employee.firstName} ${r.employee.lastName}`.toLowerCase()
    return name.includes(q) || r.incident.toLowerCase().includes(q) || r.employee.employeeNo.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Disciplinary Records</h1>
          <p className="text-gray-500 mt-1">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {isHR && (
          <Button
            onClick={() => setShowIssue(true)}
            style={{ background: '#1A2D42' }}
          >
            <Plus className="mr-2 w-4 h-4" />
            Issue Disciplinary Action
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status tabs */}
        <div className="flex gap-1">
          {STATUS_TABS.map(tab => (
            <Button
              key={tab.value}
              size="sm"
              variant={statusTab === tab.value ? 'default' : 'outline'}
              onClick={() => { setStatusTab(tab.value); setExpandedId(null) }}
              style={statusTab === tab.value ? { background: '#1A2D42' } : {}}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Type filter */}
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setExpandedId(null) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TYPE_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <Input
          className="w-56"
          placeholder="Search employee..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No disciplinary records found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-4 font-semibold text-gray-600">Employee</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Type</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Incident</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Date of Incident</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Status</th>
                    <th className="text-center p-4 font-semibold text-gray-600 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(record => {
                    const isExpanded = expandedId === record.id
                    return [
                      <tr
                        key={record.id}
                        className="border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : record.id)}
                      >
                        <td className="p-4">
                          <p className="font-medium">
                            {record.employee.lastName}, {record.employee.firstName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {record.employee.employeeNo}
                            {record.employee.department?.name && ` · ${record.employee.department.name}`}
                          </p>
                        </td>
                        <td className="p-4">
                          <Badge className={`text-xs border-0 ${TYPE_COLORS[record.type]}`}>
                            {TYPE_LABELS[record.type]}
                          </Badge>
                        </td>
                        <td className="p-4 max-w-xs">
                          <p className="truncate font-medium">{record.incident}</p>
                        </td>
                        <td className="p-4 text-gray-600">{fmt(record.dateOfIncident)}</td>
                        <td className="p-4">
                          <Badge className={`text-xs border-0 ${STATUS_COLORS[record.status]}`}>
                            {record.status}
                          </Badge>
                        </td>
                        <td className="p-4 text-center text-gray-400">
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4 mx-auto" />
                            : <ChevronDown className="w-4 h-4 mx-auto" />
                          }
                        </td>
                      </tr>,
                      isExpanded && (
                        <DetailRow
                          key={`${record.id}-detail`}
                          record={record}
                          isHR={isHR}
                          onClose={() => setExpandedId(null)}
                          onUpdate={() => { loadRecords(); setExpandedId(null) }}
                        />
                      ),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issue Dialog */}
      <IssueDialog
        open={showIssue}
        onClose={() => setShowIssue(false)}
        onCreated={() => { setShowIssue(false); loadRecords() }}
      />
    </div>
  )
}
