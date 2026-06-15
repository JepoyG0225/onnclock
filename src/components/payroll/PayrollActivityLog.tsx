'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Calculator,
  Send,
  CheckCircle2,
  Lock,
  Unlock,
  Trash2,
  Activity,
  Loader2,
  Plus,
  RefreshCw,
  PenLine,
} from 'lucide-react'

interface ActivityEntry {
  id: string
  action: string
  userName: string
  description: string | null
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
}

const ACTION_CONFIG: Record<string, { label: string; icon: typeof Activity; color: string; verb: string }> = {
  CREATE:       { label: 'Created',        icon: Plus,         color: 'text-teal-600 bg-teal-50',    verb: 'created this payroll run' },
  COMPUTE:      { label: 'Computed',       icon: Calculator,   color: 'text-blue-600 bg-blue-50',    verb: 'computed this payroll run' },
  RECOMPUTE:    { label: 'Recomputed',     icon: RefreshCw,    color: 'text-indigo-600 bg-indigo-50', verb: 'recomputed this payroll run' },
  EDIT_PAYSLIP: { label: 'Edited Payslip', icon: PenLine,      color: 'text-sky-600 bg-sky-50',      verb: 'manually edited a payslip' },
  SUBMIT:       { label: 'Submitted',      icon: Send,         color: 'text-amber-600 bg-amber-50',  verb: 'submitted for approval' },
  APPROVE:      { label: 'Approved',       icon: CheckCircle2, color: 'text-green-600 bg-green-50',  verb: 'approved this payroll run' },
  LOCK:         { label: 'Locked',         icon: Lock,         color: 'text-purple-600 bg-purple-50', verb: 'locked this payroll run' },
  UNLOCK:       { label: 'Unlocked',       icon: Unlock,       color: 'text-orange-600 bg-orange-50', verb: 'unlocked this payroll run' },
  DELETE:       { label: 'Deleted',        icon: Trash2,       color: 'text-red-600 bg-red-50',      verb: 'deleted this payroll run' },
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHrs / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHrs < 24) return `${diffHrs}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default function PayrollActivityLog({ runId }: { runId: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/payroll/${runId}/activity`)
        const data = await res.json().catch(() => ({}))
        setEntries(Array.isArray(data.entries) ? data.entries : [])
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [runId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading activity...
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No activity recorded yet.</p>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-3 bottom-3 w-px bg-gray-200" />

            <div className="space-y-4">
              {entries.map((entry) => {
                const config = ACTION_CONFIG[entry.action] ?? {
                  label: entry.action,
                  icon: Activity,
                  color: 'text-gray-600 bg-gray-50',
                  verb: `performed ${entry.action.toLowerCase()}`,
                }
                const Icon = config.icon

                return (
                  <div key={entry.id} className="relative flex gap-3 pl-1">
                    {/* Icon dot */}
                    <div className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${config.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{entry.userName}</span>
                        <span className="text-sm text-gray-600">{config.verb}</span>
                      </div>
                      {entry.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{entry.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5" title={formatDateTime(entry.createdAt)}>
                        {formatRelativeTime(entry.createdAt)}
                        {entry.ipAddress && <span className="ml-2">from {entry.ipAddress}</span>}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
