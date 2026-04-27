'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  BarChart3, Plus, Search, Loader2, ChevronRight,
  Users, CalendarRange, Star, AlertTriangle,
  CheckCircle2, Clock3, CircleDot, Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewStatus = 'DRAFT' | 'IN_REVIEW' | 'COMPLETED' | 'ACKNOWLEDGED'

interface Review {
  id: string
  cycleLabel: string
  periodStart: string
  periodEnd: string
  status: ReviewStatus
  overallRating: number | null
  employee: { id: string; firstName: string; lastName: string; employeeNo: string; department?: { name: string } | null; position?: { title: string } | null }
  reviewer: { id: string; firstName: string; lastName: string } | null
}

interface Employee {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
  department?: { name: string } | null
  position?: { title: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<ReviewStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  DRAFT:        { label: 'Draft',        color: 'bg-slate-100 text-slate-600',   icon: CircleDot    },
  IN_REVIEW:    { label: 'In Review',    color: 'bg-amber-100 text-amber-700',   icon: Clock3       },
  COMPLETED:    { label: 'Completed',    color: 'bg-blue-100 text-blue-700',     icon: CheckCircle2 },
  ACKNOWLEDGED: { label: 'Acknowledged', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.color}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  )
}

function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-slate-400">—</span>
  const r = Math.round(rating)
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= r ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
      ))}
      <span className="text-xs text-slate-500 ml-1">{rating.toFixed(1)}</span>
    </div>
  )
}

// ─── Create Cycle Modal ───────────────────────────────────────────────────────

function CreateCycleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [employees, setEmployees]   = useState<Employee[]>([])
  const [managers,  setManagers]    = useState<Employee[]>([])
  const [loading,   setLoading]     = useState(true)
  const [saving,    setSaving]      = useState(false)
  const [search,    setSearch]      = useState('')

  const [cycleLabel,   setCycleLabel]   = useState('')
  const [periodStart,  setPeriodStart]  = useState('')
  const [periodEnd,    setPeriodEnd]    = useState('')
  const [reviewerId,   setReviewerId]   = useState('')
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [selectAll,    setSelectAll]    = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/employees?limit=500&isActive=true').then(r => r.json()),
    ]).then(([empData]) => {
      const emps: Employee[] = empData.employees ?? empData.data ?? []
      setEmployees(emps)
      setManagers(emps)
    }).catch(() => toast.error('Failed to load employees'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = employees.filter(e =>
    `${e.firstName} ${e.lastName} ${e.employeeNo}`.toLowerCase().includes(search.toLowerCase())
  )

  function toggleEmployee(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectAll) {
      setSelectedIds(new Set())
      setSelectAll(false)
    } else {
      setSelectedIds(new Set(filtered.map(e => e.id)))
      setSelectAll(true)
    }
  }

  async function submit() {
    if (!cycleLabel.trim()) return toast.error('Cycle label is required')
    if (!periodStart || !periodEnd) return toast.error('Period start and end are required')
    if (selectedIds.size === 0) return toast.error('Select at least one employee')

    setSaving(true)
    try {
      const res = await fetch('/api/performance-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleLabel: cycleLabel.trim(),
          periodStart,
          periodEnd,
          reviewerId: reviewerId || null,
          employeeIds: Array.from(selectedIds),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Created ${data.created} review${data.created !== 1 ? 's' : ''} for "${cycleLabel}"`)
        onCreated()
        onClose()
      } else {
        toast.error(data.error ?? 'Failed to create reviews')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">New Review Cycle</h2>
            <p className="text-xs text-slate-500 mt-0.5">Create performance reviews for a group of employees</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Cycle info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-3">
              <label className="text-xs font-medium text-slate-600 block mb-1">Cycle Label *</label>
              <Input
                placeholder="e.g. Q2 2026, Annual 2026, Mid-Year 2026"
                value={cycleLabel}
                onChange={e => setCycleLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Period Start *</label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Period End *</label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Reviewer</label>
              <select
                value={reviewerId}
                onChange={e => setReviewerId(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1A2D42]/30"
              >
                <option value="">Use each employee&apos;s direct manager (default)</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName} ({m.employeeNo})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                {reviewerId ? 'This reviewer will be assigned to all selected employees.' : 'Each employee\'s "Reports To" manager will be auto-assigned.'}
              </p>
            </div>
          </div>

          {/* Employee selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">
                Select Employees * <span className="text-slate-400">({selectedIds.size} selected)</span>
              </label>
              <button onClick={toggleAll} className="text-xs text-[#1A2D42] font-semibold hover:underline">
                {selectAll ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder="Search employees..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : (
              <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 py-6">No employees found</p>
                ) : filtered.map(emp => (
                  <label key={emp.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                      className="rounded border-slate-300"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{emp.firstName} {emp.lastName}</p>
                      <p className="text-[11px] text-slate-400 truncate">{emp.employeeNo}{emp.department ? ` · ${emp.department.name}` : ''}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || selectedIds.size === 0} className="bg-[#1A2D42] hover:bg-[#1A2D42]/90 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Create {selectedIds.size > 0 ? `${selectedIds.size} Review${selectedIds.size !== 1 ? 's' : ''}` : 'Reviews'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: '',             label: 'All'          },
  { key: 'DRAFT',        label: 'Draft'        },
  { key: 'IN_REVIEW',    label: 'In Review'    },
  { key: 'COMPLETED',    label: 'Completed'    },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
] as const

export default function PerformanceReviewsPage() {
  const router = useRouter()
  const [reviews,      setReviews]      = useState<Review[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [showCreate,   setShowCreate]   = useState(false)
  const [activeStatus, setActiveStatus] = useState<string>('')
  const [search,       setSearch]       = useState('')
  const [page,         setPage]         = useState(1)
  const LIMIT = 25

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      if (activeStatus) params.set('status', activeStatus)
      const res  = await fetch(`/api/performance-reviews?${params}`)
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403) {
          toast.error(data.error ?? 'Performance Reviews require the Pro plan.')
        }
        return
      }
      setReviews(data.reviews ?? [])
      setTotal(data.total ?? 0)
      setStatusCounts(data.statusCounts ?? {})
    } catch {
      toast.error('Failed to load reviews')
    } finally {
      setLoading(false)
    }
  }, [activeStatus, page])

  useEffect(() => { void fetchReviews() }, [fetchReviews])

  // Client-side name search
  const displayed = reviews.filter(r =>
    search.trim() === '' ||
    `${r.employee.firstName} ${r.employee.lastName} ${r.employee.employeeNo} ${r.cycleLabel}`
      .toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#1A2D42]" />
            Performance Reviews
          </h1>
          <p className="text-gray-500 text-sm mt-1">Manage review cycles, scorecards, and employee feedback</p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-[#1A2D42] hover:bg-[#1A2D42]/90 text-white"
        >
          <Plus className="w-4 h-4 mr-2" /> New Review Cycle
        </Button>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'DRAFT',        label: 'Draft',         color: 'text-slate-600',   bg: 'bg-slate-50',   icon: CircleDot    },
          { key: 'IN_REVIEW',    label: 'In Review',     color: 'text-amber-600',   bg: 'bg-amber-50',   icon: Clock3       },
          { key: 'COMPLETED',    label: 'Completed',     color: 'text-blue-600',    bg: 'bg-blue-50',    icon: CheckCircle2 },
          { key: 'ACKNOWLEDGED', label: 'Acknowledged',  color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
        ].map(({ key, label, color, bg, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setActiveStatus(key); setPage(1) }}
            className={`${bg} rounded-xl p-4 text-left border-2 transition-all ${activeStatus === key ? 'border-[#1A2D42]' : 'border-transparent hover:border-slate-200'}`}
          >
            <Icon className={`w-5 h-5 ${color} mb-2`} />
            <p className="text-2xl font-black text-slate-900">{statusCounts[key] ?? 0}</p>
            <p className={`text-xs font-semibold ${color}`}>{label}</p>
          </button>
        ))}
      </div>

      {/* Table card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Status tabs */}
            <div className="flex items-center gap-1 flex-wrap flex-1">
              {STATUS_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveStatus(tab.key); setPage(1) }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    activeStatus === tab.key
                      ? 'bg-[#1A2D42] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                  {tab.key && statusCounts[tab.key] != null && (
                    <span className="ml-1 opacity-70">({statusCounts[tab.key]})</span>
                  )}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder="Search employee, cycle..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 text-sm h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <BarChart3 className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No reviews found</p>
              <p className="text-xs mt-1">Create a new review cycle to get started</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Employee</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Cycle</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Period</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Reviewer</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Rating</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="w-10 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {displayed.map(review => (
                      <tr
                        key={review.id}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/performance-reviews/${review.id}`)}
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-800">{review.employee.firstName} {review.employee.lastName}</p>
                          <p className="text-xs text-slate-400">{review.employee.employeeNo}{review.employee.department ? ` · ${review.employee.department.name}` : ''}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-medium text-slate-700">{review.cycleLabel}</span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                          {format(new Date(review.periodStart), 'MMM d, yyyy')} –<br />
                          {format(new Date(review.periodEnd), 'MMM d, yyyy')}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 text-sm">
                          {review.reviewer ? `${review.reviewer.firstName} ${review.reviewer.lastName}` : <span className="text-slate-300 italic">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <RatingStars rating={review.overallRating} />
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={review.status} />
                        </td>
                        <td className="px-4 py-3.5">
                          <Eye className="w-4 h-4 text-slate-300" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {displayed.map(review => (
                  <div
                    key={review.id}
                    className="px-4 py-4 hover:bg-slate-50 cursor-pointer flex items-center gap-3"
                    onClick={() => router.push(`/performance-reviews/${review.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm">{review.employee.firstName} {review.employee.lastName}</p>
                        <StatusBadge status={review.status} />
                      </div>
                      <p className="text-xs text-slate-500">{review.cycleLabel} · {format(new Date(review.periodEnd), 'MMM yyyy')}</p>
                      <div className="mt-1"><RatingStars rating={review.overallRating} /></div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                  <p className="text-xs text-slate-400">
                    Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                    <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create modal */}
      {showCreate && (
        <CreateCycleModal
          onClose={() => setShowCreate(false)}
          onCreated={fetchReviews}
        />
      )}
    </div>
  )
}
