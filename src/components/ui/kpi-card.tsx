import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Standard KPI tile for dashboard / summary surfaces.
 *
 * Consolidates the two variants that were drifting independently:
 *   • dashboard/page.tsx — hand-rolled inline-style tiles
 *   • analytics/page.tsx — bare <Card> with ad-hoc layout
 *
 * Same component, two tone presets. Use `tone` to color the icon chip
 * (the number itself stays foreground-default for scannability — a
 * 16-card dashboard with green/red/amber/blue numbers turns into a
 * Christmas tree).
 *
 * Usage:
 *
 *   <KpiCard
 *     icon={<Users className="h-5 w-5" />}
 *     label="Active Employees"
 *     value={count}
 *     tone="primary"
 *     trend={{ direction: 'up', text: '+12 this month' }}
 *   />
 */
export type KpiTone = 'primary' | 'accent' | 'success' | 'warning' | 'info' | 'neutral'

const TONE_STYLES: Record<KpiTone, { bg: string; text: string }> = {
  primary:  { bg: 'bg-primary/10',   text: 'text-primary' },
  accent:   { bg: 'bg-accent/10',    text: 'text-accent' },
  success:  { bg: 'bg-emerald-100',  text: 'text-emerald-700' },
  warning:  { bg: 'bg-amber-100',    text: 'text-amber-700' },
  info:     { bg: 'bg-sky-100',      text: 'text-sky-700' },
  neutral:  { bg: 'bg-slate-100',    text: 'text-slate-700' },
}

export interface KpiCardProps {
  /** Icon node — typically a lucide-react component sized h-5 w-5. */
  icon?: React.ReactNode
  /** Short descriptor rendered above the value. */
  label: string
  /** The primary metric. String or pre-formatted React node. */
  value: React.ReactNode
  /** Optional second-line value/description below the main value. */
  hint?: React.ReactNode
  /** Optional trend / delta indicator. Use direction='up' for positive. */
  trend?: {
    direction: 'up' | 'down' | 'flat'
    text: string
  }
  /** Icon chip color preset. Defaults to primary (navy). */
  tone?: KpiTone
  /** Optional onClick — when set the tile becomes interactive. */
  onClick?: () => void
  className?: string
}

export function KpiCard({
  icon,
  label,
  value,
  hint,
  trend,
  tone = 'primary',
  onClick,
  className,
}: KpiCardProps) {
  const toneCls = TONE_STYLES[tone]
  const isInteractive = !!onClick

  return (
    <Card
      onClick={onClick}
      className={cn(
        'transition-shadow',
        isInteractive && 'cursor-pointer hover:shadow-md',
        className,
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
            {hint && (
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            )}
            {trend && (
              <p
                className={cn(
                  'mt-2 text-xs font-medium',
                  trend.direction === 'up' && 'text-emerald-600',
                  trend.direction === 'down' && 'text-red-600',
                  trend.direction === 'flat' && 'text-muted-foreground',
                )}
              >
                {trend.direction === 'up' && '↑ '}
                {trend.direction === 'down' && '↓ '}
                {trend.text}
              </p>
            )}
          </div>
          {icon && (
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                toneCls.bg,
                toneCls.text,
              )}
            >
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
