'use client'
import { KpiCard } from '@/components/ui/kpi-card'
import { AppSpinner } from '@/components/ui/AppSpinner'

import { getStatusColor } from '@/lib/utils'

import { useEffect, useState, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { ClipboardEdit, Clock, CheckCircle, XCircle, Loader2, RefreshCw, ChevronRight, CheckCheck } from 'lucide-react'
import { RequestCardOpener } from '@/components/ui/request-card-opener'
import { TimeCorrectionDetailDialog } from '@/components/time-corrections/TimeCorrectionDetailDialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface Correction {
  id: string
  dtrRecordId: string | null
  date: string
  timeIn: string | null
  timeOut: string | null
  breakIn: string | null
  breakOut: string | null
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  adminNotes: string | null
  createdAt: string
  canAct: boolean
  actionDisabledReason?: string
  employee: {
    firstName: string
    lastName: string
    employeeNo: string
    department: { name: string } | null
    position: { title: string } | null
  }
}

const TAB_OPTIONS = [
  { label: 'Pending',  value: 'PENDING'  },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'All',      value: ''         },
]

export function CorrectionsTab() {
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1) }, 300); return () => clearTimeout(timer) }, [search])
  const [bulkApproving, setBulkApproving] = useState(false)

  const requestVersion = useRef(0)
  const fetchCorrections = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true)
    try {
      setError('')
      const qs = new URLSearchParams({ status: statusFilter, page: String(page), q: query, date })
      const res = await fetch(`/api/time-corrections?${qs}`)
      const data = await res.json().catch(() => ({}))
      if (version !== requestVersion.current) return
      if (!res.ok) throw new Error(data.error ?? 'Unable to load corrections')
      setCorrections(data.corrections ?? [])
      setTotal(data.total ?? 0)
      setCounts(data.counts ?? {})
    } catch (err) {
      if (version !== requestVersion.current) return
      setError(err instanceof Error ? err.message : 'Unable to load corrections')
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [statusFilter, page, query, date])

  useEffect(() => { fetchCorrections() }, [fetchCorrections])

  const pendingCount = counts.PENDING ?? 0
  const approvableCount = corrections.filter(c => c.status === 'PENDING' && c.canAct).length

  async function handleApproveAll() {
    if (!approvableCount) return
    const confirmed = window.confirm(
      `Approve ${approvableCount} visible pending time correction${approvableCount === 1 ? '' : 's'}?`
    )
    if (!confirmed) return

    setBulkApproving(true)
    try {
      const ids = corrections.filter(c => c.status === 'PENDING' && c.canAct).map(c => c.id)
      const res = await fetch('/api/time-corrections/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to approve')
        return
      }
      toast.success(`Approved ${data.approved} time correction${data.approved === 1 ? '' : 's'}`)
      fetchCorrections()
    } catch {
      toast.error('Failed to approve — please try again')
    } finally {
      setBulkApproving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardEdit className="w-6 h-6 text-[var(--brand-primary)]" />
            Time Entry Corrections
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and approve employee correction requests</p>
        </div>
        <div className="flex items-center gap-2">
          {statusFilter === 'PENDING' && approvableCount > 0 && (
            <Button
              onClick={handleApproveAll}
              disabled={bulkApproving || loading || !!error}
              variant="default" className=" gap-2 shrink-0"
            >
              {bulkApproving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <CheckCheck className="w-4 h-4" />}
              {bulkApproving ? 'Approving...' : `Approve visible (${approvableCount})`}
            </Button>
          )}
          <button
            onClick={fetchCorrections}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[{ label: 'All requests', value: '', icon: ClipboardEdit }, { label: 'Pending review', value: 'PENDING', icon: Clock }, { label: 'Approved', value: 'APPROVED', icon: CheckCircle }, { label: 'Rejected', value: 'REJECTED', icon: XCircle }].map(item => <KpiCard key={item.label} label={item.label} value={loading ? '...' : error ? '...' : item.value ? counts[item.value] ?? 0 : Object.values(counts).reduce((a,b) => a+b,0)} icon={<item.icon />} tone={item.value === 'PENDING' ? 'accent' : 'primary'} hint="Matching search and date" onClick={() => { setStatusFilter(item.value); setPage(1) }} />)}
      </div>
      <div className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <label className="text-xs font-semibold text-slate-600">Employee<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or employee number" className="mt-1.5 block h-11 w-full rounded-lg border px-3 text-sm font-normal" /></label>
        <label className="text-xs font-semibold text-slate-600">Correction date<input type="date" value={date} onChange={e => { setDate(e.target.value); setPage(1) }} className="mt-1.5 block h-11 w-full rounded-lg border px-3 text-sm font-normal" /></label>
        <Button variant="outline" className="h-11" onClick={() => { setSearch(''); setQuery(''); setDate(''); setPage(1) }}>Clear filters</Button>
      </div>
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1 w-fit" data-tour="corr-status-tabs">
        {TAB_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { setStatusFilter(opt.value); setPage(1) }}
            aria-pressed={statusFilter === opt.value}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
              statusFilter === opt.value
                ? 'bg-[#ff5900] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {opt.label}
            {opt.value === 'PENDING' && pendingCount > 0 && statusFilter !== 'PENDING' && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Summary bar for pending view */}
      {!loading && statusFilter === 'PENDING' && corrections.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <span className="font-semibold text-amber-800">{pendingCount} pending</span>
          {approvableCount < corrections.length && (
            <>
              <span>·</span>
              <span className="text-amber-600">{approvableCount} approvable by you</span>
            </>
          )}
        </div>
      )}

      {/* List */}
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}<Button variant="outline" className="ml-3" onClick={fetchCorrections}>Retry</Button></div> : loading ? <AppSpinner size="md" message="Loading..." className="py-10" /> : corrections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardEdit className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No {statusFilter.toLowerCase()} requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {corrections.map(c => (
            <RequestCardOpener
              key={c.id}
              renderDialog={(open, onClose) => (
                <TimeCorrectionDetailDialog
                  open={open}
                  onClose={onClose}
                  request={c}
                  onActionDone={fetchCorrections}
                />
              )}
            >
              <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm hover:border-orange-300 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        {c.employee.lastName}, {c.employee.firstName}
                      </p>

                      {!c.dtrRecordId && (
                        <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200">
                          MANUAL ENTRY
                        </span>
                      )}
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(c.status)}`}>
                        {c.status === 'PENDING'  && <Clock className="w-3 h-3" />}
                        {c.status === 'APPROVED' && <CheckCircle className="w-3 h-3" />}
                        {c.status === 'REJECTED' && <XCircle className="w-3 h-3" />}
                        {c.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {format(new Date(c.date), 'MMM d, yyyy')}
                      {` | ${c.employee.employeeNo}`}
                      {c.employee.department?.name ? ` · ${c.employee.department.name}` : ''}
                    </p>
                    <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs font-medium text-[#162d54]">
                      {[
                        c.timeIn && `In ${c.timeIn}`,
                        c.timeOut && `Out ${c.timeOut}`,
                        c.breakIn && `Break ${c.breakIn}`,
                        c.breakOut && `Resume ${c.breakOut}`,
                      ].filter(Boolean).join(' · ') || 'No time values supplied'}
                    </p>
                    <p className="mt-3 line-clamp-2 text-sm text-slate-600">{c.reason}</p>
                    <p className="mt-2 text-xs text-slate-400">Submitted {format(new Date(c.createdAt), 'MMM d, yyyy')}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </div>
              </div>
            </RequestCardOpener>
          ))}
        </div>
      )}
      {!loading && !error && total > 0 && <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"><span>{(page-1)*50+1}?{Math.min(page*50,total)} of {total} requests</span><div className="flex items-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p-1)}>Previous</Button><span>Page {page}</span><Button variant="outline" disabled={page*50 >= total} onClick={() => setPage(p => p+1)}>Next</Button></div></div>}
    </div>
  )
}
