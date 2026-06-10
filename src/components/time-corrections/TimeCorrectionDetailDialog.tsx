'use client'

import { useState } from 'react'
import { Calendar, Clock, FileText, User, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DetailRow, RequestDetailDialog } from '@/components/ui/request-detail-dialog'

export interface TimeCorrectionDetailDialogProps {
  open: boolean
  onClose: () => void
  request: {
    id: string
    dtrRecordId: string | null
    date: string
    timeIn: string | null
    timeOut: string | null
    breakIn: string | null
    breakOut: string | null
    reason: string
    status: string
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
  onActionDone: () => void
}

function formatDate(value: string, includeTime = false): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-PH', includeTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function TimeCorrectionDetailDialog({
  open,
  onClose,
  request,
  onActionDone,
}: TimeCorrectionDetailDialogProps) {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')

  const employeeName = `${request.employee.firstName} ${request.employee.lastName}`
  const positionLine = [
    request.employee.position?.title,
    request.employee.department?.name,
  ].filter(Boolean).join(' · ') || 'Employee'
  const requestedTimes = [
    request.timeIn && `Time In: ${request.timeIn}`,
    request.timeOut && `Time Out: ${request.timeOut}`,
    request.breakIn && `Break Start: ${request.breakIn}`,
    request.breakOut && `Break End: ${request.breakOut}`,
  ].filter(Boolean)

  function closeDialog() {
    setAction(null)
    setAdminNotes('')
    onClose()
  }

  async function submitReview() {
    if (!action) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/time-corrections/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, adminNotes: adminNotes.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Review failed')
      toast.success(action === 'approve' ? 'Time correction approved' : 'Time correction rejected')
      onActionDone()
      closeDialog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Review failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <RequestDetailDialog
      open={open}
      onClose={closeDialog}
      type="TIME_CORRECTION"
      id={request.id}
      title={employeeName}
      subtitle={`${positionLine} · #${request.employee.employeeNo}`}
      status={request.status}
      statusExtra={!request.dtrRecordId ? <Badge variant="outline">Manual Entry</Badge> : undefined}
      detailsSlot={
        <>
          <DetailRow
            icon={<Calendar className="h-4 w-4" />}
            label="Correction Date"
            value={formatDate(request.date)}
            hint={`Submitted ${formatDate(request.createdAt, true)}`}
          />
          <DetailRow
            icon={<Clock className="h-4 w-4" />}
            label="Requested Times"
            value={requestedTimes.length ? requestedTimes.join(' · ') : 'No time values supplied'}
          />
          <DetailRow
            icon={<User className="h-4 w-4" />}
            label="Filed By"
            value={employeeName}
            hint={positionLine}
            className="sm:col-span-2"
          />
          <DetailRow
            icon={<FileText className="h-4 w-4" />}
            label="Reason"
            value={<p className="whitespace-pre-wrap text-sm text-slate-700">{request.reason}</p>}
            className="sm:col-span-2"
          />
          {!request.dtrRecordId && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800 sm:col-span-2">
              Approving this request creates a new DTR record for the selected date.
            </div>
          )}
          {request.adminNotes && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin Note</p>
              <p className="mt-1 text-sm text-slate-700">{request.adminNotes}</p>
            </div>
          )}
          {action && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 sm:col-span-2">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <WandSparkles className="h-3.5 w-3.5" />
                Admin Note (optional)
              </label>
              <textarea
                value={adminNotes}
                onChange={event => setAdminNotes(event.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="Add a note for the employee"
              />
            </div>
          )}
        </>
      }
      actionsSlot={
        request.status === 'PENDING'
          ? action
            ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => { setAction(null); setAdminNotes('') }} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant={action === 'reject' ? 'destructive' : 'default'}
                    onClick={submitReview}
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting...' : action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                  </Button>
                </>
              )
            : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAction('reject')}
                    disabled={!request.canAct}
                    title={!request.canAct ? request.actionDisabledReason : undefined}
                    className="border-rose-200 text-rose-600 hover:bg-rose-50"
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setAction('approve')}
                    disabled={!request.canAct}
                    title={!request.canAct ? request.actionDisabledReason : undefined}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Approve
                  </Button>
                </>
              )
          : undefined
      }
    />
  )
}
