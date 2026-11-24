import type { Prisma } from '@prisma/client'
import { invoiceSeatCredit } from './credit-policy'

type Db = Pick<Prisma.TransactionClient, 'subscription' | 'invoice' | 'billingCreditEntry'>

/** Only restore a retired seat from a fully paid invoice in the current cycle. */
export async function availableSeatRestoration(db: Db, companyId: string, now = new Date()) {
  const sub = await db.subscription.findUnique({ where: { companyId } })
  if (!sub || sub.status !== 'ACTIVE' || !sub.currentPeriodStart || !sub.currentPeriodEnd || sub.currentPeriodStart > now || sub.currentPeriodEnd <= now) return null
  const invoices = await db.invoice.findMany({ where: { companyId, status: 'PAID', periodStart: { gte: sub.currentPeriodStart, lte: now }, periodEnd: sub.currentPeriodEnd, paidAt: { lte: now } }, orderBy: { paidAt: 'desc' } })
  const eligible = invoices.filter(invoice => invoiceSeatCredit(invoice, now) > 0)
  const maximum = Math.max(0, ...eligible.map(invoice => invoice.seatCount))
  if (sub.seatCount >= maximum) return null
  const entries = await db.billingCreditEntry.findMany({ where: { companyId, createdAt: { gte: sub.currentPeriodStart, lt: sub.currentPeriodEnd }, reason: { in: ['EMPLOYEE_DEACTIVATION', 'SEAT_RESTORATION'] } } })
  for (const invoice of eligible) {
    const retired = entries.filter(entry => {
      if (entry.sourceInvoiceId !== invoice.id || entry.reason !== 'EMPLOYEE_DEACTIVATION') return false
      try { return JSON.parse(entry.notes ?? '{}').seatRemoved === true } catch { return false }
    }).length
    const restored = entries.filter(entry => entry.sourceInvoiceId === invoice.id && entry.reason === 'SEAT_RESTORATION').length
    const amount = invoiceSeatCredit(invoice, now)
    if (retired > restored && Number(sub.creditBalance) >= amount) return { amount, invoiceId: invoice.id, invoiceNo: invoice.invoiceNo, maximum }
  }
  return null
}

export class SeatLimitError extends Error {
  constructor() { super('No available paid seat. Billing credit can restore a previously credited seat only when it covers the remaining-period cost and the paid seat maximum has not been reached.') }
}

/** Must run in the same transaction as the employee write. */
export async function reserveEmployeeSeat(tx: Prisma.TransactionClient, companyId: string, employeeId?: string) {
  await tx.$queryRaw`SELECT id FROM subscriptions WHERE "companyId" = ${companyId} FOR UPDATE`
  if (employeeId) {
    const employee = await tx.employee.findFirst({ where: { id: employeeId, companyId }, select: { isActive: true } })
    if (!employee) throw new Error('Employee not found')
    if (employee.isActive) return
  }
  const sub = await tx.subscription.findUnique({ where: { companyId } })
  if (!sub || sub.status !== 'ACTIVE') return
  if (!sub.currentPeriodEnd || sub.currentPeriodEnd <= new Date()) throw new SeatLimitError()
  const active = await tx.employee.count({ where: { companyId, isActive: true } })
  if (active < sub.seatCount) return
  // Existing over-cap accounts must settle their subscription first.
  if (active > sub.seatCount) throw new SeatLimitError()
  const restore = await availableSeatRestoration(tx, companyId)
  if (!restore) throw new SeatLimitError()
  await tx.subscription.update({ where: { companyId }, data: { creditBalance: { decrement: restore.amount }, seatCount: { increment: 1 } } })
  await tx.billingCreditEntry.create({ data: { companyId, amount: -restore.amount, reason: 'SEAT_RESTORATION', sourceInvoiceId: restore.invoiceId, sourceEmployeeId: employeeId ?? null, notes: JSON.stringify({ invoiceNo: restore.invoiceNo, maximumSeats: restore.maximum, seatRestored: true }) } })
}
