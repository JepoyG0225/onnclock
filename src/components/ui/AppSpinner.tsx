/**
 * Modern dot-ring activity spinner: 12 brand-orange dots arranged in a circle
 * with a staggered fade so 2–3 leading dots stay bright and the rest fade
 * clockwise. The app icon sits transparently in the centre and stays
 * perfectly still — only the dots animate.
 *
 * Sizes:
 *   sm —  inline loaders (table cells, small buttons)         48 px
 *   md —  default; card / section loaders                     96 px
 *   lg —  full-page or modal centerpieces                    160 px
 */
'use client'

import { cn } from '@/lib/utils'

type Size = 'sm' | 'md' | 'lg'

const DOT_COUNT = 12
const DOT_DURATION_S = 1.0 // full fade cycle per dot

// Pixel-precise per-size geometry.
const SIZE_MAP: Record<
  Size,
  {
    box: number       // overall square size
    dot: number       // dot diameter
    dotInset: number  // dot distance from outer edge
    iconSize: number  // app icon edge — sits in the middle
  }
> = {
  sm: { box: 48,  dot: 4,  dotInset: 2,  iconSize: 22 },
  md: { box: 96,  dot: 8,  dotInset: 4,  iconSize: 48 },
  lg: { box: 160, dot: 12, dotInset: 6,  iconSize: 80 },
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
  // Each dot is positioned at top-center of the box and rotated around the
  // box centre. transform-origin Y = (half the box) − (dotInset + half-dot).
  const originY = s.box / 2 - (s.dotInset + s.dot / 2)

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div className="relative" style={{ width: s.box, height: s.box }}>
        {/* Dot ring — each dot rotated to its slot, fading on a staggered cycle. */}
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              width: s.dot,
              height: s.dot,
              top: s.dotInset,
              left: '50%',
              marginLeft: -s.dot / 2,
              borderRadius: '50%',
              backgroundColor: '#fa5e01',
              transformOrigin: `50% ${originY + s.dot / 2}px`,
              transform: `rotate(${(i * 360) / DOT_COUNT}deg)`,
              animation: `app-spinner-tick ${DOT_DURATION_S}s linear infinite`,
              animationDelay: `${(-i * DOT_DURATION_S) / DOT_COUNT}s`,
              willChange: 'opacity',
            }}
          />
        ))}

        {/* App icon — transparent background, sits perfectly still in the center */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          aria-hidden
          draggable={false}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none object-contain"
          style={{ width: s.iconSize, height: s.iconSize }}
        />
      </div>
      {message && (
        <p className="text-sm font-medium text-slate-600">{message}</p>
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
