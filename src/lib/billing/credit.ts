/**
 * Billing-credit helpers.
 *
 *   issueDeactivationCredit(...) — earn credit when an employee is
 *     deactivated mid-cycle. The pro-rated value of one seat for the
 *     remaining cycle days is added to Subscription.creditBalance, with
 *     a ledger entry in BillingCreditEntry for audit.
 *
 *   computeCreditApplied(creditBalance, total) — pure helper for the
 *     checkout endpoints to compute "how much credit to consume" against
 *     a given amount due. Always clamped at the smaller of the two so
 *     totals can't go negative.
 *
 *   spendCreditOnInvoice(...) — atomically decrement creditBalance + log
 *     the negative ledger entry when an invoice is paid. Called from the
 *     status route once PayMongo confirms the payment.
 *
 * Policy notes:
 *   - Credits only issue on ACTIVE subscriptions inside an unexpired
 *     cycle. TRIAL / EXPIRED / no-subscription deactivations skip the
 *     refund (the company hasn't actually paid for those seats).
 *   - Credit applies to ANY subsequent paid invoice (renewal OR
 *     add-seats), not just renewals — most useful flow is "deactivate
 *     one, add another later, only pay the difference".
 *   - Discount factor of the cycle is preserved (annual 20%-discounted
 *     seats issue 20%-discounted credit, so the refund matches what was
 *     actually paid).
 */

import { prisma } from '@/lib/prisma'

const DURATION_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  '3_MONTH': 3,
  '6_MONTH': 6,
  ANNUAL: 12,
}
const DURATION_DISCOUNT_PCT: Record<string, number> = {
  MONTHLY: 0,
  '3_MONTH': 0,
  '6_MONTH': 0,
  ANNUAL: 20,
}

export interface IssueDeactivationCreditResult {
  /** Credit amount that was issued (0 when no credit was warranted). */
  amount: number
  /** ID of the ledger entry, or null if no credit was issued. */
  entryId: string | null
  /** Reason no credit was issued, when amount === 0. */
  reason?: string
}

/**
 * Issue a pro-rated billing credit for one freed-up seat on the current
 * subscription cycle. Safe to call inside a transaction.
 */
export async function issueDeactivationCredit(opts: {
  companyId: string
  employeeId: string
  /** Free-form note saved on the ledger entry for audit. */
  notes?: string
}): Promise<IssueDeactivationCreditResult> {
  const sub = await prisma.subscription.findUnique({
    where: { companyId: opts.companyId },
    select: {
      status: true, billingCycle: true, pricePerSeat: true,
      currentPeriodStart: true, currentPeriodEnd: true,
    },
  })
  if (!sub) return { amount: 0, entryId: null, reason: 'no_subscription' }
  if (sub.status !== 'ACTIVE') return { amount: 0, entryId: null, reason: `status_${sub.status}` }
  if (!sub.currentPeriodStart || !sub.currentPeriodEnd) return { amount: 0, entryId: null, reason: 'no_period' }

  const now = new Date()
  if (sub.currentPeriodEnd.getTime() <= now.getTime()) {
    return { amount: 0, entryId: null, reason: 'cycle_ended' }
  }

  const cycleKey = sub.billingCycle ?? 'ANNUAL'
  const cycleMonths = DURATION_MONTHS[cycleKey] ?? 12
  const discountPct = DURATION_DISCOUNT_PCT[cycleKey] ?? 0
  const discountFactor = 1 - discountPct / 100
  const pricePerSeat = Number(sub.pricePerSeat)

  // What ONE seat actually cost (post-discount) for the whole cycle.
  const oneSeatCycleCost = pricePerSeat * cycleMonths * discountFactor
  const totalCycleMs = Math.max(1, sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime())
  const remainingMs = Math.max(0, sub.currentPeriodEnd.getTime() - now.getTime())
  const remainingRatio = Math.min(1, remainingMs / totalCycleMs)
  const amount = parseFloat((oneSeatCycleCost * remainingRatio).toFixed(2))

  if (amount <= 0) return { amount: 0, entryId: null, reason: 'zero_amount' }

  // Two writes: bump the cached balance + log the ledger entry. Wrap in
  // a transaction so they don't drift on a partial failure.
  const [, entry] = await prisma.$transaction([
    prisma.subscription.update({
      where: { companyId: opts.companyId },
      data: { creditBalance: { increment: amount }, updatedAt: new Date() },
    }),
    prisma.billingCreditEntry.create({
      data: {
        companyId: opts.companyId,
        amount,
        reason: 'EMPLOYEE_DEACTIVATION',
        sourceEmployeeId: opts.employeeId,
        notes: opts.notes ?? null,
      },
    }),
  ])
  return { amount, entryId: entry.id }
}

/** Pure helper for checkout-endpoint cost previews and final invoice math. */
export function computeCreditApplied(creditBalance: number, total: number): number {
  return Math.max(0, Math.min(creditBalance, total))
}

/**
 * Decrement creditBalance + log a negative ledger entry once an invoice
 * that consumed credit is confirmed paid. The amount must equal what was
 * stored as `creditApplied` on the invoice's notes.
 */
export async function spendCreditOnInvoice(opts: {
  companyId: string
  amount: number
  invoiceId: string
  invoiceNo?: string
}) {
  if (opts.amount <= 0) return
  await prisma.$transaction([
    prisma.subscription.update({
      where: { companyId: opts.companyId },
      data: { creditBalance: { decrement: opts.amount }, updatedAt: new Date() },
    }),
    prisma.billingCreditEntry.create({
      data: {
        companyId: opts.companyId,
        amount: -opts.amount,
        reason: 'APPLIED_TO_INVOICE',
        sourceInvoiceId: opts.invoiceId,
        notes: opts.invoiceNo ? `Invoice ${opts.invoiceNo}` : null,
      },
    }),
  ])
}
