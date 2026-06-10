'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, CalendarDays, Clock, User, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RequestActivityFeed, type RequestActivityEvent } from '@/components/ui/request-activity-feed'
import { LeaveApprovalButtons } from '@/components/leaves/LeaveApprovalButtons'
import { statusToBadgeVariant, formatStatusLabel } from '@/lib/status'

/**
 * Full-detail modal for one leave request. Opens on row click and
 * splits the surface into two panels:
 *
 *   ┌───────────────────────────┬────────────────────────────┐
 *   │ Request details           │ Activity timeline          │
 *   │   employee + position     │   (lazy-fetched from        │
 *   │   leave type + dates      │    /api/request-activity)   │
 *   │   total days, reason      │                             │
 *   │   admin notes             │                             │
 *   │   approve/reject CTAs     │                             │
 *   └───────────────────────────┴────────────────────────────┘
 *
 * Replaces the popover approach that was getting cropped by tight
 * row widths — every cell now stays clean while the dialog owns the
 * detail surface.
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
  /** Whether the current viewer can act on this request at the current level. */
  canApprove: boolean
  /** Reason copy when the viewer cannot approve (shown in tooltip on disabled CTA). */
  approveDisabledReason?: string
  /** Whether the viewer is an HR-tier user (controls visibility of action buttons). */
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
  const [events, setEvents] = useState<RequestActivityEvent[] | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  // Lazy-fetch activity when opened.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingActivity(true)
    setActivityError(null)
    fetch(`/api/request-activity?type=LEAVE&id=${request.id}`)
      .then(async r => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}))
          throw new Error(data?.error || 'Failed to load activity')
        }
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        setEvents(data.events ?? [])
      })
      .catch(err => {
        if (!cancelled) setActivityError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingActivity(false)
      })
    return () => { cancelled = true }
  }, [open, request.id])

  // Escape to close.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const employeeName = `${request.employee.firstName} ${request.employee.lastName}`
  const positionLine = [
    request.employee.position?.title,
    request.employee.department?.name,
  ].filter(Boolean).join(' · ') || 'Employee'

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Leave request for ${employeeName}`}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="truncate text-base font-bold text-slate-900">
                {employeeName}
              </h2>
              <Badge variant={statusToBadgeVariant(request.status)}>
                {formatStatusLabel(request.status)}
              </Badge>
              {request.leaveType && !request.leaveType.isWithPay && (
                <Badge variant="outline" className="text-[10px]">Unpaid</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {positionLine} · #{request.employee.employeeNo}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — single column, details on top, activity below */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Top: details ───────────────────────────────────────────
              2-column grid on sm: and up so the short metadata rows
              (Leave Type, Date Range, Filed By) sit two-up. Reason and
              Admin Notes always span both columns because their content
              is long-form and would look cramped at half-width. */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
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
          </div>

          {/* ── Bottom: activity ───────────────────────────────────── */}
          <section className="border-t border-slate-100 bg-slate-50/40 px-5 py-5">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              Activity
            </h3>
            {loadingActivity && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading activity…
              </div>
            )}
            {activityError && (
              <p className="text-xs text-rose-600">{activityError}</p>
            )}
            {!loadingActivity && !activityError && events && (
              <RequestActivityFeed events={events} compact />
            )}
          </section>
        </div>

        {/* Footer actions */}
        {isHR && request.status === 'PENDING' && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <LeaveApprovalButtons
              requestId={request.id}
              canApprove={canApprove}
              disabledReason={approveDisabledReason}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function DetailRow({
  icon,
  label,
  value,
  hint,
  className,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  hint?: string
  /** Optional class passthrough for grid-span / layout overrides. */
  className?: string
}) {
  return (
    <div className={`flex items-start gap-3 ${className ?? ''}`}>
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <div className="mt-0.5 text-sm font-medium text-slate-900">{value}</div>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  )
}
