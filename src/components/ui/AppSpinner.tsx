/**
 * Modern iOS-style activity spinner: 12 radial tick bars fading clockwise
 * around the OnClock app icon. The fade is achieved with staggered
 * animation-delays on each tick (no whole-element rotation), so the icon in
 * the middle stays perfectly still — only the ring of bars pulses.
 *
 * Sizes:
 *   sm —  inline loaders (table cells, small buttons)         48 px
 *   md —  default; card / section loaders                     96 px
 *   lg —  full-page or modal centerpieces                    160 px
 */
'use client'

import { cn } from '@/lib/utils'

type Size = 'sm' | 'md' | 'lg'

const TICK_COUNT = 12
const TICK_DURATION_S = 1.1 // full cycle for any single tick

// Pixel-precise per-size geometry so the ticks line up around the icon.
const SIZE_MAP: Record<
  Size,
  {
    box: number       // overall square size
    tickW: number
    tickH: number
    tickTop: number   // distance from outer edge to tick top
    iconSize: number  // app-icon edge
  }
> = {
  sm: { box: 48,  tickW: 2, tickH: 7,  tickTop: 2, iconSize: 22 },
  md: { box: 96,  tickW: 3, tickH: 14, tickTop: 4, iconSize: 48 },
  lg: { box: 160, tickW: 4, tickH: 22, tickTop: 6, iconSize: 78 },
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
  // transform-origin Y = (half the box) − (tickTop) so the tick rotates about
  // the box centre while its top sits `tickTop` px from the outer edge.
  const originY = s.box / 2 - s.tickTop

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div className="relative" style={{ width: s.box, height: s.box }}>
        {/* 12 radial tick bars — each rotated to its slot and fading on a
            staggered cycle to create the rotating-pulse illusion. */}
        {Array.from({ length: TICK_COUNT }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              width: s.tickW,
              height: s.tickH,
              top: s.tickTop,
              left: '50%',
              marginLeft: -s.tickW / 2,
              borderRadius: s.tickW,
              backgroundColor: '#fa5e01',
              transformOrigin: `50% ${originY}px`,
              transform: `rotate(${(i * 360) / TICK_COUNT}deg)`,
              animation: `app-spinner-tick ${TICK_DURATION_S}s linear infinite`,
              animationDelay: `${(-i * TICK_DURATION_S) / TICK_COUNT}s`,
              willChange: 'opacity',
            }}
          />
        ))}

        {/* App icon — rounded-square mark in the iOS app-tile style. Sits
            perfectly still in the center; only the ticks animate around it. */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-white"
          style={{
            width: s.iconSize,
            height: s.iconSize,
            borderRadius: Math.round(s.iconSize * 0.22), // iOS-style superellipse-ish radius
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.10)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            aria-hidden
            draggable={false}
            className="w-full h-full select-none object-cover"
          />
        </div>
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
