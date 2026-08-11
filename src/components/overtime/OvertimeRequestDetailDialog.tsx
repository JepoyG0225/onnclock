'use client'

import { useState } from 'react'
import { Calendar, Clock, User, FileText, Sparkles, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RequestDetailDialog, DetailRow } from '@/components/ui/request-detail-dialog'

const AUTO_PREFIX = '[AUTO_OT]'

export interface OvertimeRequestDetailDialogProps {
  open: boolean
  onClose: () => void
  request: {
    id: string
    date: string
    startTime: string
    endTime: string
    hours: number
    reason: string
    status: string
    rejectionReason: string | null
    employee: {
      firstName: string
      lastName: string
      employeeNo: string
      department: { name: string } | null
      position: { title: string } | null
    } | null
  }
  canAct: boolean
  actionDisabledReason?: string
  onActionDone?: () => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  } catch {
    return iso
  }
}

export function OvertimeRequestDetailDialog({
  open,
  onClose,
  request,
  canAct,
  actionDisabledReason,
  onActionDone,
}: OvertimeRequestDetailDialogProps) {
  const [acting, setActing] = useState<'approve' | 'reject' | 'reverse' | null>(null)
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const isAuto = (request.reason ?? '').startsWith(AUTO_PREFIX)
  const cleanReason = isAuto ? request.reason.slice(AUTO_PREFIX.length).trim() : request.reason
  const employeeName = request.employee
    ? `${request.employee.firstName} ${request.employee.lastName}`
    : 'Unknown'
  const positionLine = request.employee
    ? [request.employee.position?.title, request.employee.department?.name].filter(Boolean).join(' · ') || 'Employee'
    : '—'

  function closeDialog() {
    setRejectMode(false)
    setRejectReason('')
    onClose()
  }

  async function doAction(action: 'APPROVED' | 'REJECTED') {
    setActing(action === 'APPROVED' ? 'approve' : 'reject')
    try {
      const res = await fetch(`/api/overtime-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: action,
          rejectionReason: action === 'REJECTED' ? (rejectReason || undefined) : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || `Failed to ${action === 'APPROVED' ? 'approve' : 'reject'} request`)
      }
      toast.success(action === 'APPROVED' ? 'Overtime approved' : 'Overtime rejected')
      onActionDone?.()
      closeDialog()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'An error occurred')
    } finally {
      setActing(null)
    }
  }

  async function doReverse() {
    if (!window.confirm('Reverse this approval? The request will go back to Pending status.')) return
    setActing('reverse')
    try {
      const res = await fetch(`/api/overtime-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PENDING' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to reverse approval')
      }
      toast.success('Approval reversed — request is now pending')
      onActionDone?.()
      closeDialog()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'An error occurred')
    } finally {
      setActing(null)
    }
  }

  return (
    <RequestDetailDialog
      open={open}
      onClose={closeDialog}
      type="OVERTIME"
      id={request.id}
      title={`${employeeName} — ${Number(request.hours).toFixed(2)}h OT`}
      subtitle={request.employee ? `${positionLine} · #${request.employee.employeeNo}` : ''}
      status={request.status}
      statusExtra={
        isAuto ? (
          <Badge variant="outline" className="gap-1 text-[10px] text-blue-700 border-blue-200 bg-blue-50">
            <Sparkles className="h-3 w-3" /> Auto-detected
          </Badge>
        ) : undefined
      }
      detailsSlot={
        <>
          <DetailRow
            icon={<Calendar className="h-4 w-4" />}
            label="Date"
            value={formatDate(request.date)}
          />
          <DetailRow
            icon={<Clock className="h-4 w-4" />}
            label="Time Range"
            value={`${request.startTime} – ${request.endTime}`}
            hint={`${Number(request.hours).toFixed(2)} hour${Number(request.hours) === 1 ? '' : 's'}`}
          />
          <DetailRow
            icon={<User className="h-4 w-4" />}
            label="Filed By"
            value={employeeName}
            hint={positionLine}
            className="sm:col-span-2"
          />
          {cleanReason && (
            <DetailRow
              icon={<FileText className="h-4 w-4" />}
              label={isAuto ? 'Auto-detection Note' : 'Reason'}
              value={
                <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                  {cleanReason}
                </p>
              }
              className="sm:col-span-2"
            />
          )}
          {request.status === 'REJECTED' && request.rejectionReason && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                Rejection Reason
              </p>
              <p className="mt-1 text-sm italic text-rose-900">{request.rejectionReason}</p>
            </div>
          )}
          {rejectMode && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-rose-700">
                Rejection reason (optional)
              </label>
              <input
                type="text"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Explain why this is being rejected…"
                className="mt-2 w-full rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
          )}
        </>
      }
      actionsSlot={
        request.status === 'PENDING'
          ? (
              <>
                {!rejectMode ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRejectMode(true)}
                      disabled={!!acting || !canAct}
                      title={!canAct ? actionDisabledReason : undefined}
                      className="border-rose-200 text-rose-600 hover:bg-rose-50"
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => doAction('APPROVED')}
                      disabled={!!acting || !canAct}
                      title={!canAct ? actionDisabledReason : undefined}
                      variant="success" className=""
                    >
                      {acting === 'approve' ? 'Approving…' : 'Approve'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setRejectMode(false); setRejectReason('') }} disabled={!!acting}>
                      Cancel reject
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => doAction('REJECTED')} disabled={!!acting}>
                      {acting === 'reject' ? 'Rejecting…' : 'Confirm reject'}
                    </Button>
                  </>
                )}
              </>
            )
          : request.status === 'APPROVED'
            ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={doReverse}
                  disabled={!!acting}
                  className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {acting === 'reverse' ? 'Reversing…' : 'Reverse Approval'}
                </Button>
              )
            : undefined
      }
    />
  )
}
