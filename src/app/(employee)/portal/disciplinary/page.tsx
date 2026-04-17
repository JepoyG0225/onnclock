'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldAlert, Send, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface DisciplinaryRecord {
  id: string
  type: string
  incident: string
  description: string
  dateOfIncident: string
  dateIssued: string
  issuedBy: string
  response: string | null
  respondedAt: string | null
  status: 'OPEN' | 'RESPONDED' | 'CLOSED'
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = {
  NOTICE_TO_EXPLAIN:   'Notice to Explain',
  NOTICE_OF_DECISION:  'Notice of Decision',
  WRITTEN_WARNING:     'Written Warning',
  SUSPENSION:          'Suspension',
  DEMOTION:            'Demotion',
  TERMINATION:         'Termination',
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  NOTICE_TO_EXPLAIN:   { bg: '#dbeafe', text: '#1d4ed8' },
  NOTICE_OF_DECISION:  { bg: '#f3f4f6', text: '#374151' },
  WRITTEN_WARNING:     { bg: '#fef9c3', text: '#92400e' },
  SUSPENSION:          { bg: '#ffedd5', text: '#c2410c' },
  DEMOTION:            { bg: '#f3e8ff', text: '#7e22ce' },
  TERMINATION:         { bg: '#fee2e2', text: '#b91c1c' },
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  OPEN:       { bg: '#fee2e2', text: '#b91c1c' },
  RESPONDED:  { bg: '#fef9c3', text: '#92400e' },
  CLOSED:     { bg: '#dcfce7', text: '#15803d' },
}

export default function PortalDisciplinaryPage() {
  const [records, setRecords] = useState<DisciplinaryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [responseText, setResponseText] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/disciplinary?limit=50')
        if (!res.ok) return
        const data = await res.json()
        setRecords(data.records ?? [])
      } catch { /* ignore */ } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSubmitResponse(record: DisciplinaryRecord) {
    const text = responseText[record.id]?.trim()
    if (!text) { toast.error('Please write your response before submitting'); return }
    setSubmitting(record.id)
    try {
      const res = await fetch(`/api/disciplinary/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: text }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to submit')
      }
      const data = await res.json()
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...data.record } : r))
      setResponseText(prev => { const n = { ...prev }; delete n[record.id]; return n })
      toast.success('Response submitted successfully')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit response')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          Disciplinary Records
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Your disciplinary history on file</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(n => (
            <div key={n} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldAlert className="w-12 h-12 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">No disciplinary records</p>
          <p className="text-gray-400 text-sm mt-1">You have a clean record</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(r => {
            const typeColor = TYPE_COLORS[r.type] ?? { bg: '#f3f4f6', text: '#374151' }
            const statusColor = STATUS_COLORS[r.status] ?? { bg: '#f3f4f6', text: '#374151' }
            const isOpen = expanded === r.id
            const isNTE = r.type === 'NOTICE_TO_EXPLAIN'
            const canRespond = isNTE && r.status === 'OPEN'
            const hasResponded = !!r.response

            return (
              <div
                key={r.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                {/* Card header — clickable to expand */}
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span
                          className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: typeColor.bg, color: typeColor.text }}
                        >
                          {TYPE_LABELS[r.type] ?? r.type}
                        </span>
                        {canRespond && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                            <Send className="w-3 h-3" />
                            Response required
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 text-sm leading-snug">{r.incident}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Issued {format(new Date(r.dateIssued), 'MMMM d, yyyy')} by {r.issuedBy}
                      </p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: statusColor.bg, color: statusColor.text }}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-right">
                    {isOpen ? '▲ collapse' : '▼ view details'}
                  </p>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-0 space-y-4 border-t border-gray-100">
                    {/* Description */}
                    <div className="pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                      <p className="text-sm text-gray-700 whitespace-pre-line">{r.description}</p>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <div>
                        <span className="font-medium text-gray-600 block">Date of Incident</span>
                        {format(new Date(r.dateOfIncident), 'MMM d, yyyy')}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600 block">Date Issued</span>
                        {format(new Date(r.dateIssued), 'MMM d, yyyy')}
                      </div>
                    </div>

                    {/* Existing response */}
                    {hasResponded && (
                      <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Your Response</p>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-line">{r.response}</p>
                        {r.respondedAt && (
                          <p className="text-xs text-gray-400 mt-1.5">
                            Submitted {format(new Date(r.respondedAt), 'MMM d, yyyy h:mm a')}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Response form — only for OPEN NTE */}
                    {canRespond && (
                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-blue-800 mb-0.5">Submit Your Explanation</p>
                          <p className="text-xs text-blue-600">
                            Please provide a written explanation for the incident described above. This will be recorded and reviewed by HR.
                          </p>
                        </div>
                        <textarea
                          value={responseText[r.id] ?? ''}
                          onChange={e => setResponseText(prev => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Write your explanation here…"
                          rows={5}
                          className="w-full text-sm rounded-xl border border-blue-200 bg-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none placeholder:text-gray-400"
                        />
                        <button
                          onClick={() => handleSubmitResponse(r)}
                          disabled={submitting === r.id || !responseText[r.id]?.trim()}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ background: submitting === r.id ? '#93c5fd' : '#1d4ed8' }}
                        >
                          <Send className="w-4 h-4" />
                          {submitting === r.id ? 'Submitting…' : 'Submit Explanation'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
