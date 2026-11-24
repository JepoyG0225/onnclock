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
 *   - Refunds use the paid invoice amount, never current catalog prices.
 *   - A refund retires one unused paid seat and is limited to once per employee/cycle.
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { invoiceSeatCredit, invoiceFundedAmount } from './credit-policy'

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
 * subscription cycle. Opens its own serialized transaction.
 */
export async function issueDeactivationCredit(opts: {
  companyId: string
  employeeId: string
  /** Free-form note saved on the ledger entry for audit. */
  notes?: string
}): Promise<IssueDeactivationCreditResult> {
  return prisma.$transaction(async tx => {
    // Serialize refunds and credit spending for this subscription.
    await tx.$queryRaw`SELECT id FROM subscriptions WHERE "companyId" = ${opts.companyId} FOR UPDATE`
    const sub = await tx.subscription.findUnique({ where: { companyId: opts.companyId } })
    if (!sub || sub.status !== 'ACTIVE') return { amount: 0, entryId: null, reason: 'no_active_subscription' }
    const now = new Date()
    if (!sub.currentPeriodStart || !sub.currentPeriodEnd || sub.currentPeriodEnd <= now || sub.currentPeriodStart > now) return { amount: 0, entryId: null, reason: 'no_active_period' }
    const employee = await tx.employee.findFirst({ where: { id: opts.employeeId, companyId: opts.companyId }, select: { isActive: true } })
    if (employee?.isActive) return { amount: 0, entryId: null, reason: 'employee_active' }
    const previous = await tx.billingCreditEntry.findFirst({ where: { companyId: opts.companyId, sourceEmployeeId: opts.employeeId, reason: 'EMPLOYEE_DEACTIVATION', createdAt: { gte: sub.currentPeriodStart, lt: sub.currentPeriodEnd } } })
    if (previous) return { amount: 0, entryId: previous.id, reason: 'already_credited_this_period' }
    const active = await tx.employee.count({ where: { companyId: opts.companyId, isActive: true } })
    if (sub.seatCount <= active) return { amount: 0, entryId: null, reason: 'no_unused_paid_seat' }
    const invoices = await tx.invoice.findMany({ where: { companyId: opts.companyId, status: 'PAID', periodEnd: sub.currentPeriodEnd, periodStart: { gte: sub.currentPeriodStart, lte: now }, paidAt: { lte: now } }, orderBy: [{ paidAt: 'desc' }, { id: 'asc' }] })
    const issued = await tx.billingCreditEntry.aggregate({ where: { companyId: opts.companyId, reason: { in: ['EMPLOYEE_DEACTIVATION', 'CREDIT_RECONCILIATION'] }, createdAt: { gte: sub.currentPeriodStart, lt: sub.currentPeriodEnd } }, _sum: { amount: true } })
    const verifiedInvoices = invoices.filter(invoice => invoiceSeatCredit(invoice, now) > 0)
    const remainingPaidValue = Math.max(0, verifiedInvoices.reduce((sum, invoice) => sum + invoiceFundedAmount(invoice), 0) - Math.max(0, Number(issued._sum.amount ?? 0)))
    for (const invoice of invoices) {
      const amount = Number(Math.min(invoiceSeatCredit(invoice, now), remainingPaidValue).toFixed(2))
      if (amount <= 0) continue
      const creditedSeats = await tx.billingCreditEntry.count({ where: { companyId: opts.companyId, sourceInvoiceId: invoice.id, reason: 'EMPLOYEE_DEACTIVATION' } })
      if (creditedSeats >= invoice.seatCount) continue
      await tx.subscription.update({ where: { companyId: opts.companyId }, data: { creditBalance: { increment: amount }, seatCount: { decrement: 1 } } })
      const entry = await tx.billingCreditEntry.create({ data: {
        companyId: opts.companyId, amount, reason: 'EMPLOYEE_DEACTIVATION', sourceEmployeeId: opts.employeeId, sourceInvoiceId: invoice.id,
        notes: JSON.stringify({ version: 2, message: opts.notes ?? null, invoiceNo: invoice.invoiceNo, paidTotal: invoiceFundedAmount(invoice), invoiceSeats: invoice.seatCount, seatRemoved: true, periodStart: sub.currentPeriodStart, periodEnd: sub.currentPeriodEnd }),
      } })
      return { amount, entryId: entry.id }
    }
    return { amount: 0, entryId: null, reason: 'no_verifiable_paid_seat' }
  }, { timeout: 30000 })
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
  return prisma.$transaction(tx => spendCreditInTransaction(tx, opts))
}

export async function spendCreditInTransaction(tx: Prisma.TransactionClient, opts: { companyId: string; amount: number; invoiceId: string; invoiceNo?: string }) {
  if (!Number.isFinite(opts.amount) || opts.amount < 0) throw new Error('Invalid credit amount')
  if (opts.amount === 0) return
  await tx.$queryRaw`SELECT id FROM subscriptions WHERE "companyId" = ${opts.companyId} FOR UPDATE`
  const existing = await tx.billingCreditEntry.findFirst({ where: { companyId: opts.companyId, sourceInvoiceId: opts.invoiceId, reason: 'APPLIED_TO_INVOICE' } })
  if (existing) return
  const invoice = await tx.invoice.findFirst({ where: { id: opts.invoiceId, companyId: opts.companyId, status: 'PAID' } })
  if (!invoice) throw new Error('A paid invoice is required to spend credit')
  const changed = await tx.subscription.updateMany({ where: { companyId: opts.companyId, creditBalance: { gte: opts.amount } }, data: { creditBalance: { decrement: opts.amount } } })
  if (!changed.count) throw new Error('Insufficient billing credit. Contact support to reconcile this payment.')
  await tx.billingCreditEntry.create({ data: { companyId: opts.companyId, amount: -opts.amount, reason: 'APPLIED_TO_INVOICE', sourceInvoiceId: opts.invoiceId, notes: opts.invoiceNo ? `Invoice ${opts.invoiceNo}` : null } })
}
