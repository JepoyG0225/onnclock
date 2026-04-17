'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { format } from 'date-fns'

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
  NOTICE_TO_EXPLAIN: 'Notice to Explain',
  NOTICE_OF_DECISION: 'Notice of Decision',
  WRITTEN_WARNING: 'Written Warning',
  SUSPENSION: 'Suspension',
  DEMOTION: 'Demotion',
  TERMINATION: 'Termination',
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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/disciplinary?limit=50')
        if (!res.ok) return
        const data = await res.json()
        // Filter to only this employee's records (API already scopes by companyId;
        // the employee filter is handled server-side for EMPLOYEE role)
        setRecords(data.records ?? [])
      } catch { /* ignore */ } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      {/* Header */}
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

            return (
              <button
                key={r.id}
                onClick={() => setExpanded(isOpen ? null : r.id)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all hover:shadow-md"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Type badge */}
                      <span
                        className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2"
                        style={{ background: typeColor.bg, color: typeColor.text }}
                      >
                        {TYPE_LABELS[r.type] ?? r.type}
                      </span>
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

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3 text-left">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                        <p className="text-sm text-gray-700 whitespace-pre-line">{r.description}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                        <div>
                          <span className="font-medium text-gray-600">Date of Incident</span>
                          <p>{format(new Date(r.dateOfIncident), 'MMM d, yyyy')}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Date Issued</span>
                          <p>{format(new Date(r.dateIssued), 'MMM d, yyyy')}</p>
                        </div>
                      </div>
                      {r.response && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Your Response</p>
                          <p className="text-sm text-gray-700 whitespace-pre-line bg-gray-50 rounded-xl p-3">{r.response}</p>
                          {r.respondedAt && (
                            <p className="text-xs text-gray-400 mt-1">Submitted {format(new Date(r.respondedAt), 'MMM d, yyyy')}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-gray-400 mt-2 text-right">
                    {isOpen ? '▲ collapse' : '▼ view details'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
