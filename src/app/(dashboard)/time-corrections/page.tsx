'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { ClipboardEdit, Check, X, Clock, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface Correction {
  id: string
  date: string
  timeIn: string | null
  timeOut: string | null
  breakIn: string | null
  breakOut: string | null
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  adminNotes: string | null
  createdAt: string
  employee: {
    firstName: string
    lastName: string
    employeeNo: string
    department: { name: string } | null
  }
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:  'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-green-100 text-green-700 border-green-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
}

const TAB_OPTIONS = [
  { label: 'Pending',  value: 'PENDING'  },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'All',      value: ''         },
]

export default function TimeCorrectionAdminPage() {
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [reviewing, setReviewing] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null)
  const [adminNotes, setAdminNotes] = useState('')

  const fetchCorrections = useCallback(async () => {
    setLoading(true)
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/time-corrections${qs}`)
      const data = await res.json().catch(() => ({}))
      setCorrections(data.corrections ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchCorrections() }, [fetchCorrections])

  async function handleReview(id: string, action: 'approve' | 'reject') {
    setReviewing({ id, action })
  }

  async function submitReview() {
    if (!reviewing) return
    try {
      const res = await fetch(`/api/time-corrections/${reviewing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: reviewing.action, adminNotes: adminNotes.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed'); return }
      toast.success(reviewing.action === 'approve' ? 'Request approved' : 'Request rejected')
      setReviewing(null)
      setAdminNotes('')
      fetchCorrections()
    } catch {
      toast.error('Failed to submit review')
    }
  }

  const pendingCount = corrections.filter(c => c.status === 'PENDING').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardEdit className="w-6 h-6 text-[#2E4156]" />
            Time Entry Corrections
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and approve employee correction requests</p>
        </div>
        <button
          onClick={fetchCorrections}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {TAB_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
              statusFilter === opt.value
                ? 'bg-white text-[#2E4156] shadow-sm'
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

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : corrections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardEdit className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No {statusFilter.toLowerCase()} requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {corrections.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* Employee + status */}
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-semibold text-gray-900">
                      {c.employee.lastName}, {c.employee.firstName}
                    </p>
                    <span className="text-xs text-gray-400">{c.employee.employeeNo}</span>
                    {c.employee.department && (
                      <span className="text-xs text-gray-400">· {c.employee.department.name}</span>
                    )}
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[c.status]}`}>
                      {c.status === 'PENDING'  && <Clock className="w-3 h-3" />}
                      {c.status === 'APPROVED' && <CheckCircle className="w-3 h-3" />}
                      {c.status === 'REJECTED' && <XCircle className="w-3 h-3" />}
                      {c.status}
                    </span>
                  </div>

                  {/* Date + requested times */}
                  <p className="text-sm text-gray-700 font-medium mb-1.5">
                    {format(new Date(c.date), 'EEEE, MMMM d, yyyy')}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 text-xs text-gray-500 mb-2">
                    {c.timeIn   && <span>Time In: <strong className="text-gray-700">{c.timeIn}</strong></span>}
                    {c.timeOut  && <span>Time Out: <strong className="text-gray-700">{c.timeOut}</strong></span>}
                    {c.breakIn  && <span>Break Start: <strong className="text-gray-700">{c.breakIn}</strong></span>}
                    {c.breakOut && <span>Break End: <strong className="text-gray-700">{c.breakOut}</strong></span>}
                  </div>
                  <p className="text-xs text-gray-500 italic mb-1">&ldquo;{c.reason}&rdquo;</p>
                  {c.adminNotes && (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 mt-1">
                      <span className="font-medium">Note:</span> {c.adminNotes}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Submitted {format(new Date(c.createdAt), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>

                {/* Action buttons (only for PENDING) */}
                {c.status === 'PENDING' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setAdminNotes(''); handleReview(c.id, 'approve') }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => { setAdminNotes(''); handleReview(c.id, 'reject') }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review confirmation modal */}
      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReviewing(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-gray-900">
              {reviewing.action === 'approve' ? '✅ Approve Request' : '❌ Reject Request'}
            </h2>
            <p className="text-sm text-gray-500">
              {reviewing.action === 'approve'
                ? 'The DTR record will be updated with the requested times.'
                : 'The employee will be notified of the rejection.'}
            </p>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Admin Note (optional)</label>
              <textarea
                value={adminNotes}
                onChange={e => setAdminNotes(e.target.value)}
                rows={2}
                placeholder="Add a note for the employee..."
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2E4156]/30 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setReviewing(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white transition ${
                  reviewing.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                Confirm {reviewing.action === 'approve' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
