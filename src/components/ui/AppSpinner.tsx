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

// Pixel-precise per-size geometry. iconSize is the OUTER wrapper edge; the
// inner image is scaled past it so transparent padding inside the PNG gets
// cropped away, putting the visible logo right up against the dot ring.
const SIZE_MAP: Record<
  Size,
  {
    box: number       // overall square size
    dot: number       // dot diameter
    dotInset: number  // dot distance from outer edge
    iconSize: number  // icon wrapper edge
  }
> = {
  // iconSize is half the inner-ring clear diameter so the app icon sits as a
  // small mark in the centre with plenty of breathing room before the dot ring.
  sm: { box: 48,  dot: 4,  dotInset: 2,  iconSize: 15 },
  md: { box: 96,  dot: 8,  dotInset: 4,  iconSize: 32 },
  lg: { box: 160, dot: 12, dotInset: 6,  iconSize: 52 },
}

// Crop factor — image is rendered this much larger than its wrapper so the
// transparent margins inside icon-192.png get clipped.
const ICON_CROP_SCALE = 1.3

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

        {/* App icon — transparent background, sits perfectly still in the
            center. Wrapper is iconSize; inner img is scaled up so the
            transparent padding inside the icon file gets clipped away. */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden"
          style={{ width: s.iconSize, height: s.iconSize }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            aria-hidden
            draggable={false}
            className="w-full h-full select-none object-contain"
            style={{ transform: `scale(${ICON_CROP_SCALE})` }}
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
