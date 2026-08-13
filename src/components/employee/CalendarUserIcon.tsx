/**
 * Calendar-with-person — the Leave icon.
 *
 * lucide-react 0.575.0 has no calendar+person glyph (`CalendarUser` landed in a
 * later release), and bumping the icon library app-wide to gain one glyph would
 * touch every icon in the product. This is drawn on lucide's own grid instead:
 * 24x24 viewBox, fill none, stroke currentColor, 2px stroke, round caps and
 * joins — so it sits beside the real lucide icons without looking foreign.
 *
 * Takes the same props the nav passes to a lucide icon (className, strokeWidth),
 * so it is a drop-in replacement.
 */
export function CalendarUserIcon({
  className,
  strokeWidth = 2,
  ...rest
}: React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* Calendar frame — same rings and header rule as lucide's Calendar */}
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      {/* Person in the body: head, then shoulders */}
      <circle cx="12" cy="14.5" r="2" />
      <path d="M8.5 19.5a3.5 3.5 0 0 1 7 0" />
    </svg>
  )
}
