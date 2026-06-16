import { cn } from '@/lib/utils'

/**
 * Philippine Peso (₱) icon — drop-in replacement for Lucide's DollarSign.
 * Accepts the same `className` prop so it works anywhere DollarSign was used.
 */
export function PesoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('inline-block', className)}
      aria-label="Philippine Peso"
    >
      {/* ₱ glyph as SVG paths */}
      {/* Vertical bar */}
      <line x1="12" y1="2" x2="12" y2="22" />
      {/* Top arch of P */}
      <path d="M7 5h7a4 4 0 0 1 0 8H7" />
      {/* Two horizontal peso lines */}
      <line x1="6" y1="10" x2="17" y2="10" />
      <line x1="6" y1="14" x2="17" y2="14" />
    </svg>
  )
}
