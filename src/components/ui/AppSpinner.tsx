/**
 * Modern brand-aware loading spinner: the OnClock logo sitting still in the
 * middle of a rotating gradient ring. Use anywhere a `<Loader2 />` would feel
 * too generic — page transitions, in-page data refetches, modal loading,
 * empty-state loaders.
 *
 * Sizes:
 *   sm — inline use inside small areas (forms, table cells)   48px
 *   md — default; in-card or section loaders                 80px
 *   lg — full-page or modal centerpieces                    128px
 */
'use client'

import { cn } from '@/lib/utils'

type Size = 'sm' | 'md' | 'lg'

const SIZE_MAP: Record<Size, { box: string; logo: string; ring: string; pulse: string }> = {
  sm: { box: 'w-12 h-12', logo: 'w-5 h-5', ring: 'border-2', pulse: 'inset-1' },
  md: { box: 'w-20 h-20', logo: 'w-9 h-9', ring: 'border-[3px]', pulse: 'inset-2' },
  lg: { box: 'w-32 h-32', logo: 'w-14 h-14', ring: 'border-4', pulse: 'inset-3' },
}

export function AppSpinner({
  size = 'md',
  message,
  className,
}: {
  size?: Size
  message?: string
  className?: string
}) {
  const s = SIZE_MAP[size]
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div className={cn('relative flex items-center justify-center', s.box)}>
        {/* Soft pulsing halo behind the ring */}
        <div className={cn('absolute rounded-full bg-[#fa5e01]/10 animate-ping', s.pulse)} />

        {/* Static background ring */}
        <div className={cn('absolute inset-0 rounded-full border-slate-200', s.ring)} />

        {/* Rotating arc with brand orange */}
        <div
          className={cn(
            'absolute inset-0 rounded-full border-transparent animate-spin',
            s.ring,
          )}
          style={{
            borderTopColor: '#fa5e01',
            borderRightColor: '#fa5e01',
            animationDuration: '0.9s',
          }}
        />

        {/* Centered app mark */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/onclock-logo.png"
          alt=""
          aria-hidden="true"
          className={cn('relative z-10 object-contain select-none', s.logo)}
          draggable={false}
        />
      </div>
      {message && (
        <p className="text-sm font-medium text-slate-600 animate-pulse">{message}</p>
      )}
    </div>
  )
}

/**
 * Full-viewport overlay spinner — for blocking page transitions or initial
 * loads. Renders a centered AppSpinner over a translucent backdrop.
 */
export function AppSpinnerScreen({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <AppSpinner size="lg" message={message ?? 'Loading…'} />
    </div>
  )
}
