'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Clock3, Sparkles, ChevronRight, ChevronDown, CheckCheck, XCircle, Undo2, Loader2, CalendarRange, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { RequestCardOpener } from '@/components/ui/request-card-opener'
import { OvertimeRequestDetailDialog } from '@/components/overtime/OvertimeRequestDetailDialog'
import { toast } from 'sonner'

type OtStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

interface OtEmployee {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
  department: { name: string } | null
  position: { title: string } | null
}

interface OtRequest {
  id: string
  date: string
  startTime: string
  endTime: string
  hours: number
  reason: string
  status: OtStatus
  rejectionReason: string | null
  canAct: boolean
  actionDisabledReason?: string
  employee: OtEmployee | null
}

interface EmployeeGroup {
  key: string
  employee: OtEmployee | null
  items: OtRequest[]
  approvableIds: string[]
  totalHours: number
}

const AUTO_PREFIX = '[AUTO_OT]'

const STATUS_META: Record<OtStatus, { label: string; cls: string }> = {
  PENDING:   { label: 'Pending',   cls: 'bg-amber-100 text-amber-700' },
  APPROVED:  { label: 'Approved',  cls: 'bg-emerald-100 text-emerald-700' },
  REJECTED:  { label: 'Rejected',  cls: 'bg-rose-100 text-rose-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600' },
}

const TABS: { key: string; label: string }[] = [
  { key: 'PENDING',   label: 'Pending' },
  { key: 'APPROVED',  label: 'Approved' },
  { key: 'REJECTED',  label: 'Rejected' },
  { key: '',          label: 'All' },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** Date-only (YYYY-MM-DD) inclusive range test against the request date. */
function inRange(iso: string, from: string, to: string) {
  const d = iso.slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export default function OvertimeRequestsPage() {
  const [requests, setRequests] = useState<OtRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string>('PENDING')
  const [bulkApproving, setBulkApproving] = useState(false)
  const [bulkRejecting, setBulkRejecting] = useState(false)
  const [bulkReversing, setBulkReversing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setSelected(new Set())
    try {
      const res = await fetch(`/api/overtime-requests${status ? `?status=${status}` : ''}`)
      const data = await res.json().catch(() => ({}))
      setRequests(data.requests ?? [])
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { load() }, [load])

  // Pending → approve/reject selection; Approved → reverse-approval selection.
  const showCheckboxes = status === 'PENDING' || status === 'APPROVED'
  const reverseMode = status === 'APPROVED'

  // A row is selectable when it can be acted on in the current tab.
  const isSelectable = useCallback(
    (r: OtRequest) => (reverseMode ? r.status === 'APPROVED' : r.status === 'PENDING' && r.canAct),
    [reverseMode],
  )

  // Apply the date-range filter, then group by employee.
  const groups = useMemo<EmployeeGroup[]>(() => {
    const filtered = requests.filter(r => inRange(r.date, dateFrom, dateTo))
    const map = new Map<string, EmployeeGroup>()
    for (const r of filtered) {
      const key = r.employee?.id ?? 'unknown'
      let g = map.get(key)
      if (!g) {
        g = { key, employee: r.employee, items: [], approvableIds: [], totalHours: 0 }
        map.set(key, g)
      }
      g.items.push(r)
      g.totalHours += Number(r.hours)
      // `approvableIds` holds the ids selectable in the current tab.
      if (isSelectable(r)) g.approvableIds.push(r.id)
    }
    return Array.from(map.values()).sort((a, b) => {
      const an = a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : 'Unknown'
      const bn = b.employee ? `${b.employee.firstName} ${b.employee.lastName}` : 'Unknown'
      return an.localeCompare(bn)
    })
  }, [requests, dateFrom, dateTo, isSelectable])

  const allApprovableIds = useMemo(() => groups.flatMap(g => g.approvableIds), [groups])
  const selectedCount = selected.size
  const selectedHours = useMemo(() => {
    if (selected.size === 0) return 0
    return requests.filter(r => selected.has(r.id)).reduce((sum, r) => sum + Number(r.hours), 0)
  }, [requests, selected])
  const allSelected = allApprovableIds.length > 0 && allApprovableIds.every(id => selected.has(id))
  const filterActive = !!dateFrom || !!dateTo

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleGroupSelect(g: EmployeeGroup) {
    const everySelected = g.approvableIds.length > 0 && g.approvableIds.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (everySelected) g.approvableIds.forEach(id => next.delete(id))
      else g.approvableIds.forEach(id => next.add(id))
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(prev => {
      if (allApprovableIds.length > 0 && allApprovableIds.every(id => prev.has(id))) return new Set()
      return new Set(allApprovableIds)
    })
  }

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function handleApproveSelected() {
    const ids = [...selected]
    if (ids.length === 0) return
    const confirmed = window.confirm(
      `Approve ${ids.length} selected overtime request${ids.length === 1 ? '' : 's'} (${selectedHours.toFixed(1)}h total)?`
    )
    if (!confirmed) return

    setBulkApproving(true)
    try {
      const res = await fetch('/api/overtime-requests/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to approve')
        return
      }
      toast.success(`Approved ${data.approved} overtime request${data.approved === 1 ? '' : 's'}`)
      load()
    } catch {
      toast.error('Failed to approve — please try again')
    } finally {
      setBulkApproving(false)
    }
  }

  async function handleRejectSelected() {
    const ids = [...selected]
    if (ids.length === 0) return
    const reason = window.prompt(
      `Reject ${ids.length} selected overtime request${ids.length === 1 ? '' : 's'}?\n\nOptional reason (shown to the employee):`,
      ''
    )
    // prompt returns null when cancelled; '' means confirmed with no reason.
    if (reason === null) return

    setBulkRejecting(true)
    try {
      const res = await fetch('/api/overtime-requests/bulk-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, reason: reason.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to reject')
        return
      }
      toast.success(`Rejected ${data.rejected} overtime request${data.rejected === 1 ? '' : 's'}`)
      load()
    } catch {
      toast.error('Failed to reject — please try again')
    } finally {
      setBulkRejecting(false)
    }
  }

  async function handleReverseSelected() {
    const ids = [...selected]
    if (ids.length === 0) return
    const confirmed = window.confirm(
      `Reverse approval for ${ids.length} selected overtime request${ids.length === 1 ? '' : 's'}? They will return to Pending.`
    )
    if (!confirmed) return

    setBulkReversing(true)
    try {
      const res = await fetch('/api/overtime-requests/bulk-reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to reverse')
        return
      }
      toast.success(`Reversed ${data.reversed} approval${data.reversed === 1 ? '' : 's'} back to pending`)
      load()
    } catch {
      toast.error('Failed to reverse — please try again')
    } finally {
      setBulkReversing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock3 className="w-6 h-6 text-[#021e47]" />
            Overtime Requests
          </h1>
          <p className="text-gray-500 text-sm mt-1">Review and approve overtime — including hours auto-detected from timesheets.</p>
        </div>
        {showCheckboxes && (
          <div className="flex items-center gap-2 shrink-0">
            {reverseMode ? (
              <Button
                onClick={handleReverseSelected}
                disabled={bulkReversing || selectedCount === 0}
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-2 disabled:opacity-50"
              >
                {bulkReversing
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Undo2 className="w-4 h-4" />}
                {bulkReversing ? 'Reversing...' : `Reverse Approval${selectedCount ? ` (${selectedCount})` : ''}`}
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleRejectSelected}
                  disabled={bulkRejecting || bulkApproving || selectedCount === 0}
                  variant="outline"
                  className="border-rose-300 text-rose-700 hover:bg-rose-50 gap-2 disabled:opacity-50"
                >
                  {bulkRejecting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <XCircle className="w-4 h-4" />}
                  {bulkRejecting ? 'Rejecting...' : `Reject Selected${selectedCount ? ` (${selectedCount})` : ''}`}
                </Button>
                <Button
                  onClick={handleApproveSelected}
                  disabled={bulkApproving || bulkRejecting || selectedCount === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 disabled:opacity-50"
                >
                  {bulkApproving
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCheck className="w-4 h-4" />}
                  {bulkApproving ? 'Approving...' : `Approve Selected${selectedCount ? ` (${selectedCount})` : ''}`}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Status tabs + date range filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-gray-50 p-1 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${status === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <CalendarRange className="w-4 h-4 text-slate-400 shrink-0" />
          <Input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={e => setDateFrom(e.target.value)}
            className="h-8 w-[9.5rem]"
            aria-label="From date"
          />
          <span className="text-slate-400">–</span>
          <Input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={e => setDateTo(e.target.value)}
            className="h-8 w-[9.5rem]"
            aria-label="To date"
          />
          {filterActive && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Select-all + summary bar (pending view) */}
      {!loading && showCheckboxes && groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleSelectAll}
              disabled={allApprovableIds.length === 0}
            />
            <span className="font-medium text-amber-800">Select all</span>
          </label>
          <span>·</span>
          <span className="font-semibold text-amber-800">{groups.reduce((n, g) => n + g.items.length, 0)} request(s) · {groups.length} employee(s)</span>
          {selectedCount > 0 && (
            <>
              <span>·</span>
              <span className="text-emerald-700 font-medium">{selectedCount} selected ({selectedHours.toFixed(1)}h)</span>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-gray-400 text-sm">
          No {status ? STATUS_META[status as OtStatus]?.label.toLowerCase() : ''} overtime requests{filterActive ? ' in this date range' : ''}.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {groups.map(g => {
            const isCollapsed = collapsed.has(g.key)
            const name = g.employee ? `${g.employee.firstName} ${g.employee.lastName}` : 'Unknown'
            const groupSelected = g.approvableIds.length > 0 && g.approvableIds.every(id => selected.has(id))
            const groupSelectedCount = g.approvableIds.filter(id => selected.has(id)).length
            return (
              <Card key={g.key} className="overflow-hidden">
                {/* Group header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/70 border-b">
                  {showCheckboxes && (
                    <Checkbox
                      checked={groupSelected}
                      onCheckedChange={() => toggleGroupSelect(g)}
                      disabled={g.approvableIds.length === 0}
                      aria-label={`Select all for ${name}`}
                    />
                  )}
                  <button
                    onClick={() => toggleCollapse(g.key)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    {isCollapsed
                      ? <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 truncate">{name}</span>
                        {g.employee?.employeeNo && <span className="text-xs text-slate-400">{g.employee.employeeNo}</span>}
                        {g.employee?.department?.name && (
                          <span className="text-xs text-slate-400">· {g.employee.department.name}</span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {showCheckboxes && groupSelectedCount > 0 && (
                      <Badge className="text-[11px] border-0 bg-emerald-100 text-emerald-700">{groupSelectedCount} selected</Badge>
                    )}
                    <Badge className="text-[11px] border-0 bg-slate-200 text-slate-700">
                      {g.items.length} · {g.totalHours.toFixed(1)}h
                    </Badge>
                  </div>
                </div>

                {/* Group items */}
                {!isCollapsed && (
                  <div className="divide-y">
                    {g.items.map(r => {
                      const isAuto = (r.reason ?? '').startsWith(AUTO_PREFIX)
                      const cleanReason = isAuto ? r.reason.slice(AUTO_PREFIX.length).trim() : r.reason
                      const checkable = isSelectable(r)
                      return (
                        <div key={r.id} className="flex items-stretch gap-2 pl-3">
                          {showCheckboxes && (
                            <div className="flex items-center pt-0.5">
                              <Checkbox
                                checked={selected.has(r.id)}
                                onCheckedChange={() => toggleSelect(r.id)}
                                disabled={!checkable}
                                aria-label={`Select overtime on ${fmtDate(r.date)}`}
                                title={!checkable && r.status === 'PENDING' ? (r.actionDisabledReason ?? 'You cannot approve this request') : undefined}
                              />
                            </div>
                          )}
                          <RequestCardOpener
                            className="flex-1"
                            renderDialog={(open, onClose) => (
                              <OvertimeRequestDetailDialog
                                open={open}
                                onClose={onClose}
                                request={r}
                                canAct={r.canAct}
                                actionDisabledReason={r.actionDisabledReason}
                                onActionDone={load}
                              />
                            )}
                          >
                            <div className="py-3 pr-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-slate-700">{fmtDate(r.date)}</span>
                                  <span className="text-sm text-slate-500">{r.startTime}–{r.endTime}</span>
                                  <span className="text-sm font-semibold text-slate-800">{Number(r.hours).toFixed(2)}h</span>
                                  <Badge className={`text-[11px] border-0 ${STATUS_META[r.status].cls}`}>{STATUS_META[r.status].label}</Badge>
                                  {isAuto && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                      <Sparkles className="w-3 h-3" /> Auto-detected
                                    </span>
                                  )}
                                </div>
                                {cleanReason && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{cleanReason}</p>}
                              </div>
                              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 self-center" />
                            </div>
                          </RequestCardOpener>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
