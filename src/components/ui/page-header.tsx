import { cn } from '@/lib/utils'

/**
 * Standard dashboard page header.
 *
 * Replaces the `flex items-center justify-between` + `text-2xl font-bold
 * text-gray-900` block that's been copy-pasted across employees.tsx,
 * payroll.tsx, leaves.tsx, analytics.tsx, dtr.tsx and friends. One
 * component standardizes:
 *   • Title size + weight
 *   • Subtitle color + spacing
 *   • Mobile-first stack → desktop row layout
 *   • The action slot (top-right on desktop, full-width below the title
 *     on mobile)
 *
 * Usage:
 *
 *   <PageHeader
 *     title="Payroll Runs"
 *     subtitle={`${count} runs · last computed ${formatDate(date)}`}
 *     actions={<Button>New Payroll Run</Button>}
 *   />
 *
 * For a back-link variant pass `backHref` and the header renders a
 * compact "← Back" link above the title — useful for detail pages.
 */
export interface PageHeaderProps {
  title: string
  subtitle?: React.ReactNode
  /** Right-aligned action slot (button group, dropdown, etc.). */
  actions?: React.ReactNode
  /** Optional eyebrow text above the title (e.g. "Payroll · Detail"). */
  eyebrow?: string
  /** Optional icon rendered to the left of the title. */
  icon?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  icon,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
          )}
          <h1 className="truncate text-xl font-bold text-foreground sm:text-2xl">
            {title}
          </h1>
        </div>
        {subtitle && (
          <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
