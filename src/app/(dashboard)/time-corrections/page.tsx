'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { ClipboardEdit, Clock, CheckCircle, XCircle, Loader2, RefreshCw, ChevronRight } from 'lucide-react'
import { RequestCardOpener } from '@/components/ui/request-card-opener'
import { TimeCorrectionDetailDialog } from '@/components/time-corrections/TimeCorrectionDetailDialog'

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
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('PENDING')

  const fetchCorrections = useCallback(async () => {
    setLoading(true)
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/time-corrections${qs}`)
      const data = await res.json().catch(() => ({}))
      setCorrections(data.corrections ?? [])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchCorrections() }, [fetchCorrections])

  const pendingCount = corrections.filter(c => c.status === 'PENDING').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardEdit className="w-6 h-6 text-[#032b63]" />
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
                ? 'bg-white text-[#032b63] shadow-sm'
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
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
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
                    {!c.dtrRecordId && (
                      <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200">
                        MANUAL ENTRY
                      </span>
                    )}
                  </div>

                  {/* Date + requested times */}
                  <p className="text-sm text-gray-700 font-medium mb-1.5">
                    {format(new Date(c.date), 'EEEE, MMMM d, yyyy')}
                  </p>
                  {c.dtrRecordId ? (
                    <p className="text-[11px] text-gray-500 mb-1.5">
                      Record ID: <span className="font-mono text-gray-700">{c.dtrRecordId}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-violet-600 mb-1.5">
                      No existing DTR — approving this will create a new DTR row for this date.
                    </p>
                  )}
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

                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
              </div>
            </div>
            </RequestCardOpener>
          ))}
        </div>
      )}
    </div>
  )
}
