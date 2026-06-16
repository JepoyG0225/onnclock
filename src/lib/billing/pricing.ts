/**
 * Subscription pricing helpers.
 *
 * IMPORTANT: discounts are applied to the INVOICE TOTAL via a discount
 * percentage — never by lowering the stored `pricePerSeat`, because
 * `pricePerSeat` drives feature entitlement (see hasHrisProFeature /
 * hasSecurityFeature in lib/feature-gates). Discounting the per-seat price
 * would silently strip a company's paid features.
 */

/** Companies billing MORE than this many seats qualify for the volume discount. */
export const VOLUME_DISCOUNT_THRESHOLD = 100
/** Volume discount percentage for 100+ seat companies. */
export const VOLUME_DISCOUNT_PCT = 30

/**
 * Volume discount for large companies. Based on the number of seats being
 * billed (which is >= active employee count), so a company with over 100
 * employees gets 30% off.
 */
export function volumeDiscountPct(seatCount: number): number {
  return seatCount > VOLUME_DISCOUNT_THRESHOLD ? VOLUME_DISCOUNT_PCT : 0
}

/**
 * Stack multiple discount percentages MULTIPLICATIVELY and return the combined
 * effective percentage (2 decimals). e.g. combineDiscountPct(20, 30) === 44
 * (1 − 0.8 × 0.7 = 0.44). This keeps stacked discounts from ever exceeding
 * 100% and composes cleanly with the existing proration math.
 */
export function combineDiscountPct(...pcts: number[]): number {
  const factor = pcts.reduce((f, p) => f * (1 - (p || 0) / 100), 1)
  return Math.round((1 - factor) * 10000) / 100
}

export type BillingCycleKey = '3_MONTH' | '6_MONTH' | 'ANNUAL'

/** Prepay discounts for companies UNDER the volume threshold (only annual). */
const STANDARD_DURATION_DISCOUNT: Record<BillingCycleKey, number> = {
  '3_MONTH': 0,
  '6_MONTH': 0,
  ANNUAL: 20,
}

/**
 * Prepay discounts for volume companies (100+ billed seats): 3-month and
 * 6-month plans get 20% off, and the annual plan gets 30% off. These REPLACE
 * the standard duration discounts above (they do not stack on top of them).
 */
const VOLUME_DURATION_DISCOUNT: Record<BillingCycleKey, number> = {
  '3_MONTH': 20,
  '6_MONTH': 20,
  ANNUAL: 30,
}

/**
 * The single source of truth for the prepay discount % applied to an invoice,
 * given the billing cycle and the number of seats being billed. Used by both
 * the billing UI (to display) and the server payment routes (to charge), so
 * the two never disagree. Unknown cycles (e.g. MONTHLY/null) yield 0.
 */
export function effectiveDiscountPct(cycle: string | null | undefined, seatCount: number): number {
  const table = volumeDiscountPct(seatCount) > 0 ? VOLUME_DURATION_DISCOUNT : STANDARD_DURATION_DISCOUNT
  return (table as Record<string, number>)[cycle ?? ''] ?? 0
}
