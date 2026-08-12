/**
 * Safe numeric query-param parsing for API routes.
 *
 * The idiom scattered across the API is
 *   Math.min(500, Math.max(1, parseInt(searchParams.get('limit') ?? '50')))
 * which looks bounded but is not: `parseInt('abc')` is NaN, and both Math.min
 * and Math.max propagate NaN. That NaN reaches Prisma as `take: NaN` and comes
 * back as an opaque 500 — the same shape as the disciplinary and export bugs.
 *
 * Anything unparseable falls back to the default rather than erroring: a junk
 * `?limit=` should not take a page down.
 */
export function intParam(
  raw: string | null | undefined,
  { def, min = 1, max }: { def: number; min?: number; max: number },
): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, n))
}
