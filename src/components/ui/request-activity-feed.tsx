import { CheckCircle2, XCircle, Clock, FileText, MessageCircle, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Visualizes the lifecycle of a request (leave, overtime, cash advance,
 * budget requisition, time correction, etc.) as a vertical timeline.
 *
 * Designed to be CMS-agnostic — accepts pre-resolved events from a
 * server-side helper (lib/request-activity.ts) so it doesn't need to
 * know about Prisma, audit log shape, or workflow engine internals.
 *
 * Each event renders as:
 *   ● [actor] [action verb] · level N · timestamp
 *     "optional notes"
 *
 * Action types map to icon + color tone:
 *   submit   — slate FileText (neutral)
 *   approve  — emerald CheckCircle (success)
 *   reject   — rose XCircle (destructive)
 *   pending  — slate Clock outlined (muted; for not-yet-reached steps)
 *   comment  — slate MessageCircle (informational)
 *
 * Usage (server component):
 *
 *   const events = await buildRequestActivity({
 *     submission: { actorName: 'Jane Doe', at: req.createdAt },
 *     trail: req.approvalTrail,
 *     companyId,
 *   })
 *   return <RequestActivityFeed events={events} />
 */
export type RequestActivityEventType = 'submit' | 'approve' | 'reject' | 'pending' | 'comment' | 'upload'

export interface RequestActivityEvent {
  type: RequestActivityEventType
  actorName: string
  /** Optional second line under the actor name (e.g. job title or role). */
  actorRole?: string
  /** ISO timestamp. */
  at: string
  /** Approval workflow level — rendered as "L1", "L2" etc. when set. */
  level?: number
  /** Optional human-readable label (e.g. "HR Manager", "Department Head"). */
  levelLabel?: string
  /** Free-form notes captured during approval/rejection. */
  notes?: string | null
  /** Optional descriptive verb override (defaults derived from `type`). */
  verb?: string
}

const TYPE_STYLES: Record<RequestActivityEventType, {
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  iconColor: string
  defaultVerb: string
}> = {
  submit:  { icon: FileText,      iconBg: 'bg-slate-100',   iconColor: 'text-slate-600',   defaultVerb: 'submitted the request' },
  approve: { icon: CheckCircle2,  iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', defaultVerb: 'approved the request' },
  reject:  { icon: XCircle,       iconBg: 'bg-rose-100',    iconColor: 'text-rose-600',    defaultVerb: 'rejected the request' },
  pending: { icon: Clock,         iconBg: 'bg-slate-50',    iconColor: 'text-slate-400',   defaultVerb: 'is the next approver' },
  comment: { icon: MessageCircle, iconBg: 'bg-slate-100',   iconColor: 'text-slate-600',   defaultVerb: 'left a comment' },
  upload:  { icon: Paperclip,     iconBg: 'bg-blue-100',    iconColor: 'text-blue-600',    defaultVerb: 'uploaded an attachment' },
}

function formatTimestamp(at: string): string {
  try {
    const d = new Date(at)
    if (Number.isNaN(d.getTime())) return at
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  } catch {
    return at
  }
}

export interface RequestActivityFeedProps {
  events: RequestActivityEvent[]
  className?: string
  /** Compact mode — smaller dots, tighter spacing. Default false. */
  compact?: boolean
}

export function RequestActivityFeed({ events, className, compact = false }: RequestActivityFeedProps) {
  if (events.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground italic', className)}>
        No activity recorded yet.
      </p>
    )
  }

  const dotSize = compact ? 'h-7 w-7' : 'h-9 w-9'
  const iconSize = compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const lineLeft = compact ? 'left-[13px]' : 'left-[17px]'

  return (
    <ol className={cn('relative space-y-4', className)}>
      {/* Vertical connecting line — drawn behind the dots */}
      {events.length > 1 && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-3 bottom-3 w-px bg-slate-200',
            lineLeft,
          )}
        />
      )}

      {events.map((evt, i) => {
        const { icon: Icon, iconBg, iconColor, defaultVerb } = TYPE_STYLES[evt.type]
        const verb = evt.verb ?? defaultVerb
        const muted = evt.type === 'pending'

        return (
          <li key={i} className="relative flex gap-3">
            <div
              className={cn(
                'relative z-10 flex shrink-0 items-center justify-center rounded-full ring-4 ring-white',
                dotSize,
                iconBg,
              )}
            >
              <Icon className={cn(iconSize, iconColor)} />
            </div>
            <div className={cn('min-w-0 flex-1 pt-1', muted && 'opacity-60')}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-sm">
                  <span className="font-semibold text-foreground">{evt.actorName}</span>
                  <span className="text-muted-foreground"> {verb}</span>
                </p>
                {evt.level != null && (
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    L{evt.level}
                    {evt.levelLabel ? ` · ${evt.levelLabel}` : ''}
                  </span>
                )}
              </div>
              {evt.actorRole && (
                <p className="mt-0.5 text-xs text-muted-foreground">{evt.actorRole}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">{formatTimestamp(evt.at)}</p>
              {evt.notes && (
                <p className="mt-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
                  &ldquo;{evt.notes}&rdquo;
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
