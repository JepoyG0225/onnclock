'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, ClipboardList, Clock3, Banknote, FileText, CalendarDays, Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RequestActivityFeed, type RequestActivityEvent } from '@/components/ui/request-activity-feed'
import { statusToBadgeVariant, formatStatusLabel } from '@/lib/status'

const TYPE_META: Record<string, { label: string; icon: ReactNode }> = {
  LEAVE:           { label: 'Leave Request',        icon: <CalendarDays className="h-5 w-5" /> },
  OVERTIME:        { label: 'Overtime Request',      icon: <Clock3 className="h-5 w-5" /> },
  CASH_ADVANCE:    { label: 'Cash Advance',          icon: <Banknote className="h-5 w-5" /> },
  BUDGET:          { label: 'Budget Requisition',    icon: <ClipboardList className="h-5 w-5" /> },
  TIME_CORRECTION: { label: 'Time Correction',       icon: <FileText className="h-5 w-5" /> },
  PAYROLL:         { label: 'Payroll',                icon: <Receipt className="h-5 w-5" /> },
}

/**
 * Shared modal shell for any request type's detail view. Owns:
 *   • Overlay + escape/click-outside close
 *   • Header (title + subtitle + status pill)
 *   • A docked body that lays out the type-specific detail rows on top
 *     and the activity feed at the bottom
 *   • Footer with a Close button and an actions slot for type-specific
 *     Approve/Reject buttons
 *   • Lazy-fetch of the activity feed from /api/request-activity, so
 *     each call site only passes `(type, id)` and the modal handles
 *     loading + error UI
 *
 * Each request type provides its own thin wrapper (BudgetReqDetailDialog,
 * CashAdvanceDetailDialog, etc.) that passes type-specific title /
 * details / actions content into this shell.
 */
export type RequestDetailType = 'LEAVE' | 'OVERTIME' | 'CASH_ADVANCE' | 'BUDGET' | 'TIME_CORRECTION' | 'PAYROLL'

export interface RequestDetailDialogProps {
  open: boolean
  onClose: () => void
  type: RequestDetailType
  /** Request ID — used by both the activity API and aria labels. */
  id: string
  /** Top-of-modal title (typically the requester's name). */
  title: string
  /** One-line subtitle under the title (position · employee no etc.). */
  subtitle?: ReactNode
  /** Status string mapped to a Badge variant via lib/status helpers. */
  status: string
  /** Optional second badge to the right of the status one (e.g. "Unpaid"). */
  statusExtra?: ReactNode
  /** Type-specific detail rows — usually a 2-col grid of <DetailRow>. */
  detailsSlot: ReactNode
  /** Optional footer actions (Approve/Reject), only shown when set. */
  actionsSlot?: ReactNode
  /**
   * The activity API endpoint is shared, but some surfaces may want to
   * pass extra context (e.g. the desktop app vs. portal). For now this
   * is a no-op extension hook.
   */
  ariaLabel?: string
}

export function RequestDetailDialog({
  open,
  onClose,
  type,
  id,
  title,
  subtitle,
  status,
  statusExtra,
  detailsSlot,
  actionsSlot,
  ariaLabel,
}: RequestDetailDialogProps) {
  const [events, setEvents] = useState<RequestActivityEvent[] | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  // Lazy-fetch activity when opened. Restart for each (type, id) pair.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingActivity(true)
    setActivityError(null)
    fetch(`/api/request-activity?type=${type}&id=${id}`)
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
  }, [open, type, id])

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

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
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
        <div
          className="relative px-5 py-4"
          style={{ background: 'linear-gradient(135deg, #ff5900 0%, #ff7a33 100%)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full p-1.5 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 text-white/80 mb-2">
            {TYPE_META[type]?.icon}
            <span className="text-xs font-semibold uppercase tracking-wider">
              {TYPE_META[type]?.label ?? type}
            </span>
          </div>
          <h2 className="truncate text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-white/70">{subtitle}</p>}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge variant={statusToBadgeVariant(status)} className="border-white/30">
              {formatStatusLabel(status)}
            </Badge>
            {statusExtra}
          </div>
        </div>

        {/* Body — single column, details on top, activity below */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
            {detailsSlot}
          </div>

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
            {activityError && <p className="text-xs text-rose-600">{activityError}</p>}
            {!loadingActivity && !activityError && events && (
              <RequestActivityFeed events={events} compact />
            )}
          </section>
        </div>

        {/* Footer */}
        {actionsSlot && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            {actionsSlot}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ── Detail row helper exported from the same module so consumers
//    don't have to import it separately. Same shape as the one inside
//    LeaveRequestDetailDialog so behavior matches across types.
export function DetailRow({
  icon,
  label,
  value,
  hint,
  className,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-start gap-3 ${className ?? ''}`}>
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <div className="mt-0.5 text-sm font-medium text-slate-900">{value}</div>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  )
}
