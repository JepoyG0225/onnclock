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

const BASE_TONE = {
    card: 'border-[#e5ecf4] bg-white',
    value: 'text-[var(--brand-ink)]',
    muted: 'text-slate-500',
}

const TONE_STYLES: Record<KpiTone, { card: string; bg: string; text: string; value: string; muted: string; strip: string }> = {
  primary: { ...BASE_TONE, bg: 'bg-blue-50', text: 'text-[var(--brand-primary)]', strip: '' },
  accent: { ...BASE_TONE, bg: 'bg-cyan-50', text: 'text-cyan-600', strip: '' },
  success: { ...BASE_TONE, bg: 'bg-emerald-50', text: 'text-emerald-600', strip: '' },
  warning: { ...BASE_TONE, bg: 'bg-rose-50', text: 'text-[var(--brand-danger)]', strip: '' },
  info: { ...BASE_TONE, bg: 'bg-sky-50', text: 'text-sky-600', strip: '' },
  neutral: { ...BASE_TONE, bg: 'bg-slate-100', text: 'text-slate-600', strip: '' },
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
        'relative overflow-hidden shadow-sm transition-all',
        toneCls.card,
        toneCls.strip,
        isInteractive && 'cursor-pointer hover:-translate-y-0.5 hover:border-[var(--brand-primary)] hover:shadow-lg',
        className,
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn('text-xs font-semibold', toneCls.muted)}>{label}</p>
            <p className={cn('mt-1 text-3xl font-black tracking-tight', toneCls.value)}>{value}</p>
            {hint && (
              <p className={cn('mt-1 text-xs', toneCls.muted)}>{hint}</p>
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
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm',
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
