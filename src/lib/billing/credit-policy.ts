export type PaidSeatInvoice = { id: string; status: string; seatCount: number; total: unknown; periodStart: Date; periodEnd: Date; paidAt: Date | null; notes: string | null }
export function invoiceFundedAmount(invoice: PaidSeatInvoice): number {
  let credit = 0
  try { credit = Number(JSON.parse(invoice.notes ?? '{}')?.subscriptionActivationPayload?.creditApplied ?? 0) } catch { /* Legacy notes */ }
  if (!Number.isFinite(credit) || credit < 0) return 0
  const total = Number(invoice.total)
  return Number.isFinite(total) && total >= 0 ? Number((total + credit).toFixed(2)) : 0
}
export function invoiceSeatCredit(invoice: PaidSeatInvoice, at: Date): number {
  if (invoice.status !== 'PAID' || !invoice.paidAt || invoice.paidAt > at || invoice.seatCount <= 0 || invoice.periodStart > at || invoice.periodEnd <= at) return 0
  const duration = invoice.periodEnd.getTime() - invoice.periodStart.getTime()
  if (duration <= 0) return 0
  // Delta-only plan changes do not establish a complete paid seat valuation.
  try { if (JSON.parse(invoice.notes ?? '{}')?.subscriptionActivationPayload?.skipPeriodReset) return 0 } catch { /* Legacy invoices can have plain-text notes. */ }
  const paid = invoiceFundedAmount(invoice)
  if (!Number.isFinite(paid) || paid <= 0) return 0
  return Number((paid / invoice.seatCount * Math.min(1, (invoice.periodEnd.getTime() - at.getTime()) / duration)).toFixed(2))
}
