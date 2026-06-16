import type { ComponentProps } from 'react'
import type { Badge } from '@/components/ui/badge'

/**
 * Status → Badge variant mapping.
 *
 * Replaces the older getStatusColor() string-returning helper in
 * lib/utils.ts. Returning a Badge variant (instead of a class string)
 * lets the Badge component own its own theming through CVA — change
 * the variant once in badge.tsx and every status pill follows. Also
 * makes the call site cleaner:
 *
 *   <Badge variant={statusToBadgeVariant(run.status)}>
 *     {run.status}
 *   </Badge>
 *
 * Status keys are the union of every enum we ship in Prisma
 * (PayrollRunStatus, LeaveRequestStatus, OvertimeRequestStatus,
 * DisciplinaryStatus, EmploymentStatus, etc.). Unknown statuses fall
 * back to the neutral "pending" tone.
 */

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>

const STATUS_MAP: Record<string, BadgeVariant> = {
  // Approval / lifecycle — green
  APPROVED: 'success',
  COMPLETED: 'success',
  ACTIVE: 'success',
  PAID: 'success',
  RELEASED: 'success',
  REGULAR: 'success',
  ONGOING: 'success',

  // In-progress / awaiting — amber
  FOR_APPROVAL: 'warning',
  PENDING: 'warning',
  IN_PROGRESS: 'warning',
  PROBATIONARY: 'warning',
  PROCESSING: 'warning',
  PARTIAL: 'warning',

  // Final / locked / informational — sky
  COMPUTED: 'info',
  LOCKED: 'info',
  SUBMITTED: 'info',
  ACKNOWLEDGED: 'info',

  // Negative / final-bad — red
  REJECTED: 'destructive',
  CANCELLED: 'destructive',
  FAILED: 'destructive',
  TERMINATED: 'destructive',
  EXPIRED: 'destructive',

  // Neutral / draft / no-action — slate
  DRAFT: 'pending',
  RESIGNED: 'pending',
  INACTIVE: 'pending',
  SKIPPED: 'pending',
  CLOSED: 'pending',
}

export function statusToBadgeVariant(status: string | null | undefined): BadgeVariant {
  if (!status) return 'pending'
  return STATUS_MAP[status.toUpperCase()] ?? 'pending'
}

/**
 * Convenience: derive a human-friendly label from an enum value
 * (FOR_APPROVAL → "For Approval"). Keeps callers from repeating
 * the same map across pages.
 */
export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return status
    .toLowerCase()
    .split(/[_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
