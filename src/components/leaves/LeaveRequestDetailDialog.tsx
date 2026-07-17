'use client'

import { CalendarDays, Clock, User, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { RequestDetailDialog, DetailRow } from '@/components/ui/request-detail-dialog'
import { LeaveApprovalButtons } from '@/components/leaves/LeaveApprovalButtons'

/**
 * Leave-request specific instance of the shared RequestDetailDialog.
 * Provides the leave-shaped title / subtitle / details rows / footer
 * actions; the shared shell handles the modal chrome + activity feed.
 */
export interface LeaveDetailDialogProps {
  open: boolean
  onClose: () => void
  request: {
    id: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    approvalLevel: number | null
    startDate: string
    endDate: string
    totalDays: number | string
    reason: string | null
    reviewNotes: string | null
    isHalfDay: boolean
    halfDayPeriod: string | null
    createdAt: string
    employee: {
      firstName: string
      lastName: string
      employeeNo: string
      department: { name: string } | null
      position: { title: string } | null
    }
    leaveType: { name: string; code: string; isWithPay: boolean } | null
  }
  canApprove: boolean
  approveDisabledReason?: string
  isHR: boolean
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

export function LeaveRequestDetailDialog({
  open,
  onClose,
  request,
  canApprove,
  approveDisabledReason,
  isHR,
}: LeaveDetailDialogProps) {
  const employeeName = `${request.employee.firstName} ${request.employee.lastName}`
  const positionLine = [
    request.employee.position?.title,
    request.employee.department?.name,
  ].filter(Boolean).join(' · ') || 'Employee'

  return (
    <RequestDetailDialog
      open={open}
      onClose={onClose}
      type="LEAVE"
      id={request.id}
      title={employeeName}
      subtitle={`${positionLine} · #${request.employee.employeeNo}`}
      status={request.status}
      statusExtra={
        request.leaveType && !request.leaveType.isWithPay
          ? <Badge variant="outline" className="text-[10px]">Unpaid</Badge>
          : undefined
      }
      detailsSlot={
        <>
          <DetailRow
            icon={<CalendarDays className="h-4 w-4" />}
            label="Leave Type"
            value={
              request.leaveType
                ? `${request.leaveType.code} — ${request.leaveType.name}`
                : '—'
            }
          />
          <DetailRow
            icon={<Clock className="h-4 w-4" />}
            label="Date Range"
            value={
              request.startDate === request.endDate
                ? formatDate(request.startDate)
                : `${formatDate(request.startDate)} → ${formatDate(request.endDate)}`
            }
            hint={
              request.isHalfDay
                ? `Half-day · ${request.halfDayPeriod ?? ''}`
                : `${Number(request.totalDays).toFixed(1)} day${Number(request.totalDays) === 1 ? '' : 's'}`
            }
          />
          <DetailRow
            icon={<User className="h-4 w-4" />}
            label="Filed By"
            value={employeeName}
            hint={`${positionLine} · Submitted ${formatDate(request.createdAt)}`}
            className="sm:col-span-2"
          />
          {request.reason && (
            <DetailRow
              icon={<FileText className="h-4 w-4" />}
              label="Reason"
              value={
                <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                  {request.reason}
                </p>
              }
              className="sm:col-span-2"
            />
          )}
          {request.reviewNotes && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Admin Notes
              </p>
              <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                {request.reviewNotes}
              </p>
            </div>
          )}
        </>
      }
      actionsSlot={
        // Show approval actions to HR roles OR to anyone the approval
        // workflow authorizes for this step (canApprove) — e.g. a
        // PAYROLL_OFFICER explicitly configured as an approver. Gating on
        // isHR alone hid the buttons from non-HR workflow approvers.
        (isHR || canApprove) && request.status === 'PENDING'
          ? (
              <LeaveApprovalButtons
                requestId={request.id}
                canApprove={canApprove}
                disabledReason={approveDisabledReason}
              />
            )
          : undefined
      }
    />
  )
}
