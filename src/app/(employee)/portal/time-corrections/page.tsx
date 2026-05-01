'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ClipboardEdit, Plus, X, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
    if (!form.dtrRecordId) { toast.error('Please select a time entry record'); return }
    if (!form.reason.trim()) { toast.error('Reason is required'); return }
    if (!form.timeIn && !form.timeOut) { toast.error('Enter at least one time to correct'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/time-corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dtrRecordId: form.dtrRecordId,
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
      setShowForm(false)
      fetchCorrections()
    } finally {
      setSubmitting(false)
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardEdit className="w-5 h-5 text-[#2E4156]" />
            Time Entry Corrections
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Request corrections to your attendance records</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#2E4156] text-white rounded-lg text-sm font-medium hover:bg-[#1A2D42] transition"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'New Request'}
        </button>
      </div>

      {/* New Request Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">New Correction Request</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Time Entry Record *</label>
              <select
                value={form.dtrRecordId}
                onChange={e => handleSelectTimeEntry(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2E4156]/30 focus:border-[#2E4156] outline-none"
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
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input
                type="date"
                value={form.date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2E4156]/30 focus:border-[#2E4156] outline-none"
                required
                readOnly
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Time In</label>
              <input
                type="time"
                value={form.timeIn}
                onChange={e => setForm(p => ({ ...p, timeIn: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2E4156]/30 focus:border-[#2E4156] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Time Out</label>
              <input
                type="time"
                value={form.timeOut}
                onChange={e => setForm(p => ({ ...p, timeOut: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2E4156]/30 focus:border-[#2E4156] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Break Start</label>
              <input
                type="time"
                value={form.breakIn}
                onChange={e => setForm(p => ({ ...p, breakIn: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2E4156]/30 focus:border-[#2E4156] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Break End</label>
              <input
                type="time"
                value={form.breakOut}
                onChange={e => setForm(p => ({ ...p, breakOut: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2E4156]/30 focus:border-[#2E4156] outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
              <textarea
                value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                rows={3}
                placeholder="Explain why you need this correction..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2E4156]/30 focus:border-[#2E4156] outline-none resize-none"
                required
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-[#2E4156] text-white rounded-lg text-sm font-medium hover:bg-[#1A2D42] transition disabled:opacity-50"
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
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
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
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-gray-900 text-sm">
                      {format(new Date(c.date), 'MMMM d, yyyy')}
                    </p>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>
                      {STATUS_ICONS[c.status]} {c.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-500 mb-2">
                    {c.timeIn  && <span>Time In: <strong>{c.timeIn}</strong></span>}
                    {c.timeOut && <span>Time Out: <strong>{c.timeOut}</strong></span>}
                    {c.breakIn && <span>Break Start: <strong>{c.breakIn}</strong></span>}
                    {c.breakOut && <span>Break End: <strong>{c.breakOut}</strong></span>}
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
