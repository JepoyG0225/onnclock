'use client'
import { useState, useEffect, useCallback } from 'react'
import { Clock3, Sparkles, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RequestCardOpener } from '@/components/ui/request-card-opener'
import { OvertimeRequestDetailDialog } from '@/components/overtime/OvertimeRequestDetailDialog'

type OtStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

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
  employee: {
    id: string
    firstName: string
    lastName: string
    employeeNo: string
    department: { name: string } | null
    position: { title: string } | null
  } | null
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

export default function OvertimeRequestsPage() {
  const [requests, setRequests] = useState<OtRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string>('PENDING')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/overtime-requests${status ? `?status=${status}` : ''}`)
      const data = await res.json().catch(() => ({}))
      setRequests(data.requests ?? [])
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Clock3 className="w-6 h-6 text-[#021e47]" />
          Overtime Requests
        </h1>
        <p className="text-gray-500 text-sm mt-1">Review and approve overtime — including hours auto-detected from timesheets. Approved OT is paid on the next payroll recompute.</p>
      </div>

      {/* Status tabs */}
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

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-gray-400 text-sm">No {status ? STATUS_META[status as OtStatus]?.label.toLowerCase() : ''} overtime requests.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {requests.map(r => {
            const isAuto = (r.reason ?? '').startsWith(AUTO_PREFIX)
            const cleanReason = isAuto ? r.reason.slice(AUTO_PREFIX.length).trim() : r.reason
            const name = r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : 'Unknown'
            return (
              <RequestCardOpener
                key={r.id}
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
                <Card>
                  <CardContent className="p-4 flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800">{name}</p>
                        {r.employee?.employeeNo && <span className="text-xs text-slate-400">{r.employee.employeeNo}</span>}
                        <Badge className={`text-[11px] border-0 ${STATUS_META[r.status].cls}`}>{STATUS_META[r.status].label}</Badge>
                        {isAuto && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            <Sparkles className="w-3 h-3" /> Auto-detected
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        {fmtDate(r.date)} · {r.startTime}–{r.endTime} · <span className="font-semibold">{Number(r.hours).toFixed(2)}h</span>
                        {r.employee?.department?.name ? ` · ${r.employee.department.name}` : ''}
                      </p>
                      {cleanReason && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{cleanReason}</p>}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 self-center" />
                  </CardContent>
                </Card>
              </RequestCardOpener>
            )
          })}
        </div>
      )}
    </div>
  )
}
