import { cn } from '@/lib/utils'

/**
 * Standard empty-state for list pages and card content.
 *
 * Replaces the `text-center py-16` + grey icon + headline + optional
 * CTA pattern that's been copy-pasted at least 6 times across the
 * dashboard (employees, payroll, leaves, dashboard widgets, analytics
 * placeholder, etc.). Consolidating gives every empty area:
 *   • Consistent vertical rhythm
 *   • A muted icon treatment
 *   • A consistent CTA slot
 *
 * Usage:
 *
 *   <EmptyState
 *     icon={<Users className="h-6 w-6" />}
 *     title="No employees yet"
 *     description="Add your first employee to start tracking time."
 *     action={<Button>Add Employee</Button>}
 *   />
 *
 * Variants:
 *   • size="sm" — for card-content empty states (inline within a card)
 *   • size="md" — default, for full-page empty states
 */
export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  const padding = size === 'sm' ? 'py-8' : 'py-16'
  const iconSize = size === 'sm' ? 'h-10 w-10' : 'h-14 w-14'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        padding,
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'mb-4 flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
            iconSize,
          )}
        >
          {icon}
        </div>
      )}
      <h3
        className={cn(
          'font-semibold text-foreground',
          size === 'sm' ? 'text-sm' : 'text-base',
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'mt-1 max-w-sm text-muted-foreground',
            size === 'sm' ? 'text-xs' : 'text-sm',
          )}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
