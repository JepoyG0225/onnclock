/**
 * Modern dot-ring activity spinner: 12 brand-blue dots arranged in a circle
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
    length: number    // rounded bar length
    dotInset: number  // dot distance from outer edge
  }
> = {
  // Tight geometry: ring sits close to the icon (≈ 8-9 px breathing room each
  // side at lg) so the spinner reads as a single mark, not "icon floating
  // inside a much bigger halo".
  sm: { box: 32, dot: 3, length: 8, dotInset: 1 },
  md: { box: 64, dot: 6, length: 15, dotInset: 2 },
  lg: { box: 96, dot: 9, length: 22, dotInset: 3 },
}

// Crop factor — image is rendered this much larger than its wrapper so the
// transparent margins inside icon-192.png get clipped.

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
  const originY = s.box / 2 - (s.dotInset + s.length / 2)

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
              height: s.length,
              top: s.dotInset,
              left: '50%',
              marginLeft: -s.dot / 2,
              borderRadius: 999,
              backgroundColor: 'var(--brand-primary)',
              transformOrigin: `50% ${originY + s.length / 2}px`,
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
