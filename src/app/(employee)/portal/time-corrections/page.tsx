'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ClipboardEdit, Plus, X, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppSpinner } from '@/components/ui/AppSpinner'

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
  /** null = manual entry (no existing DTR to edit). */
  dtrRecordId?: string | null
}

interface TimeEntryRecord {
  id: string
  date: string
  timeIn: string | null
  timeOut: string | null
  breakIn: string | null
  breakOut: string | null
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:  'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING:  <Clock className="w-3.5 h-3.5" />,
  APPROVED: <CheckCircle className="w-3.5 h-3.5" />,
  REJECTED: <XCircle className="w-3.5 h-3.5" />,
}

export default function TimeCorrectionPortalPage() {
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [timeEntries, setTimeEntries] = useState<TimeEntryRecord[]>([])

  // ── Entry mode ─────────────────────────────────────────────────────
  // 'pick'   — fix an existing DTR row (default; dropdown of recent
  //            attendance auto-fills date + times)
  // 'manual' — file a correction for a day with no DTR at all (forgot
  //            to clock in, was offline, on field assignment without a
  //            terminal, etc.). The approval flow on the admin side
  //            creates a brand-new DTR row stamped with
  //            source='MANUAL_CORRECTION' so the entry is auditable.
  const [entryMode, setEntryMode] = useState<'pick' | 'manual'>('pick')

  const [form, setForm] = useState({
    dtrRecordId: '',
    date: '',
    timeIn: '',
    timeOut: '',
    breakIn: '',
    breakOut: '',
    reason: '',
  })

  async function fetchCorrections() {
    try {
      const res = await fetch('/api/time-corrections')
      const data = await res.json().catch(() => ({}))
      setCorrections(data.corrections ?? [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  async function fetchTimeEntries() {
    try {
      const res = await fetch('/api/attendance/logs?limit=60')
      const data = await res.json().catch(() => ({}))
      setTimeEntries(data.records ?? [])
    } catch {
      // silent
    }
  }

  function formatTimeValue(value: string | null): string {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    // 12-hour format without leading zeros — "1:00 PM" / "9:30 AM"
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  function extractTimeInput(value: string | null): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  function handleSelectTimeEntry(dtrRecordId: string) {
    const selected = timeEntries.find((record) => record.id === dtrRecordId)
    if (!selected) {
      setForm((prev) => ({ ...prev, dtrRecordId: '' }))
      return
    }
    const selectedDate = new Date(selected.date)
    const yyyy = selectedDate.getFullYear()
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const dd = String(selectedDate.getDate()).padStart(2, '0')
    setForm((prev) => ({
      ...prev,
      dtrRecordId,
      date: `${yyyy}-${mm}-${dd}`,
      timeIn: extractTimeInput(selected.timeIn),
      timeOut: extractTimeInput(selected.timeOut),
      breakIn: extractTimeInput(selected.breakIn),
      breakOut: extractTimeInput(selected.breakOut),
    }))
  }

  useEffect(() => {
    fetchCorrections()
    fetchTimeEntries()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date) { toast.error('Date is required'); return }
    // dtrRecordId is only required in pick mode — manual entries are for
    // days with no DTR row at all.
    if (entryMode === 'pick' && !form.dtrRecordId) {
      toast.error('Please select a time entry record')
      return
    }
    if (!form.reason.trim()) { toast.error('Reason is required'); return }
    if (!form.timeIn && !form.timeOut) { toast.error('Enter at least one time to correct'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/time-corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // In manual mode omit dtrRecordId entirely so the API knows to
          // create a new DTR on approval (source: MANUAL_CORRECTION).
          dtrRecordId: entryMode === 'pick' ? form.dtrRecordId : undefined,
          date: form.date,
          timeIn:  form.timeIn  || null,
          timeOut: form.timeOut || null,
          breakIn:  form.breakIn  || null,
          breakOut: form.breakOut || null,
          reason: form.reason.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed to submit'); return }
      toast.success('Correction request submitted')
      setForm({ dtrRecordId: '', date: '', timeIn: '', timeOut: '', breakIn: '', breakOut: '', reason: '' })
      setEntryMode('pick')
      setShowForm(false)
      fetchCorrections()
    } finally {
      setSubmitting(false)
    }
  }

  // Reset the form whenever the user toggles between pick and manual so
  // the previously-filled DTR auto-fill doesn't leak into the other mode.
  function switchEntryMode(next: 'pick' | 'manual') {
    setEntryMode(next)
    setForm({ dtrRecordId: '', date: '', timeIn: '', timeOut: '', breakIn: '', breakOut: '', reason: '' })
  }

  async function handleCancel(id: string) {
    setCancelling(id)
    try {
      const res = await fetch(`/api/time-corrections/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed to cancel'); return }
      toast.success('Request cancelled')
      fetchCorrections()
    } finally {
      setCancelling(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardEdit className="w-5 h-5 text-[#000000] shrink-0" />
            <span className="truncate">Time Entry Corrections</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Request corrections to your attendance records</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#000000] text-white rounded-lg text-sm font-medium hover:bg-primary transition shrink-0"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span className="hidden sm:inline">{showForm ? 'Cancel' : 'New Request'}</span>
        </button>
      </div>

      {/* New Request Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-semibold text-gray-700">New Correction Request</h2>
            {/* Mode toggle — "pick existing" vs "manual entry". The two
                modes hit the same API; the difference is whether a
                dtrRecordId is sent. */}
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => switchEntryMode('pick')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  entryMode === 'pick'
                    ? 'bg-white text-[#000000] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Edit existing
              </button>
              <button
                type="button"
                onClick={() => switchEntryMode('manual')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  entryMode === 'manual'
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Manual entry
              </button>
            </div>
          </div>

          {entryMode === 'manual' && (
            <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 text-xs text-violet-800">
              For days you couldn&apos;t clock in at all (missed clock-in,
              offline, field assignment, etc.). HR will create a new DTR
              for the selected date if they approve the request.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {entryMode === 'pick' && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Time Entry Record *</label>
                <select
                  value={form.dtrRecordId}
                  onChange={e => handleSelectTimeEntry(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#000000]/30 focus:border-[#000000] outline-none"
                  required
                >
                  <option value="">Select a time entry</option>
                  {timeEntries.map((record) => (
                    <option key={record.id} value={record.id}>
                      {format(new Date(record.date), 'MMM d, yyyy')} • In {formatTimeValue(record.timeIn)} • Out {formatTimeValue(record.timeOut)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input
                type="date"
                value={form.date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#000000]/30 focus:border-[#000000] outline-none"
                required
                /* Date is autopopulated from the dropdown in pick mode,
                   so we lock it. In manual mode the user picks any past
                   date themselves. */
                readOnly={entryMode === 'pick'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Time In</label>
              <input
                type="time"
                value={form.timeIn}
                onChange={e => setForm(p => ({ ...p, timeIn: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#000000]/30 focus:border-[#000000] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Time Out</label>
              <input
                type="time"
                value={form.timeOut}
                onChange={e => setForm(p => ({ ...p, timeOut: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#000000]/30 focus:border-[#000000] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Break Start</label>
              <input
                type="time"
                value={form.breakIn}
                onChange={e => setForm(p => ({ ...p, breakIn: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#000000]/30 focus:border-[#000000] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Break End</label>
              <input
                type="time"
                value={form.breakOut}
                onChange={e => setForm(p => ({ ...p, breakOut: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#000000]/30 focus:border-[#000000] outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
              <textarea
                value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                rows={3}
                placeholder="Explain why you need this correction..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#000000]/30 focus:border-[#000000] outline-none resize-none"
                required
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-[#000000] text-white rounded-lg text-sm font-medium hover:bg-primary transition disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      )}

      {/* Corrections List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <AppSpinner size="md" />
        </div>
      ) : corrections.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ClipboardEdit className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No correction requests yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {corrections.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">
                      {format(new Date(c.date), 'MMMM d, yyyy')}
                    </p>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>
                      {STATUS_ICONS[c.status]} {c.status}
                    </span>
                    {!c.dtrRecordId && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 uppercase tracking-wide">
                        Manual entry
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mb-2">
                    {c.timeIn  && <span>In: <strong>{c.timeIn}</strong></span>}
                    {c.timeOut && <span>Out: <strong>{c.timeOut}</strong></span>}
                    {c.breakIn && <span>Break: <strong>{c.breakIn}</strong></span>}
                    {c.breakOut && <span>Resume: <strong>{c.breakOut}</strong></span>}
                  </div>
                  <p className="text-xs text-gray-500 italic">&ldquo;{c.reason}&rdquo;</p>
                  {c.adminNotes && (
                    <p className="text-xs text-gray-600 mt-1.5 bg-gray-50 rounded px-2 py-1">
                      <span className="font-medium">Admin note:</span> {c.adminNotes}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Submitted {format(new Date(c.createdAt), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
                {c.status === 'PENDING' && (
                  <button
                    onClick={() => handleCancel(c.id)}
                    disabled={cancelling === c.id}
                    className="flex-shrink-0 text-[11px] font-medium text-red-500 hover:text-red-700 transition disabled:opacity-50"
                  >
                    {cancelling === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Cancel'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
