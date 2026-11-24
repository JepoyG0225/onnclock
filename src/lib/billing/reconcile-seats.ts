import { prisma } from '@/lib/prisma'
import { getPaymentIntentStatus } from '@/lib/payments/paymongo'
import { spendCreditInTransaction } from './credit'

export async function reconcileSeatPayment(invoiceId: string, companyId: string) {
 const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId } })
 if (!invoice) throw new Error('Invoice not found')
 if (invoice.status === 'PAID') return { status: 'succeeded', alreadyActivated: true }
 const notes = JSON.parse(invoice.notes ?? '{}')
 const activation = notes.subscriptionActivationPayload
 if (notes.paymentProvider !== 'PAYMONGO_QRPH' || !/^pi_[A-Za-z0-9]+$/.test(notes.paymentIntentId ?? '') || !Number.isInteger(activation?.addSeats) || activation.addSeats <= 0) throw new Error('Invalid seat payment')
 const payment = await getPaymentIntentStatus(notes.paymentIntentId)
 if (payment.status !== 'succeeded') return { status: payment.status }
 if (payment.amount !== Math.round(Number(invoice.total) * 100) || payment.currency !== 'PHP') throw new Error('Payment amount or currency does not match invoice')
 return prisma.$transaction(async tx => {
  await tx.$queryRaw`SELECT id FROM subscriptions WHERE "companyId" = ${companyId} FOR UPDATE`
  const current = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
  if (current?.status === 'PAID') return { status: 'succeeded', alreadyActivated: true }
  if (!current || current.notes !== invoice.notes || Number(current.total) !== Number(invoice.total)) throw new Error('Invoice changed during verification')
  const subscription = await tx.subscription.findUnique({ where: { companyId } })
  if (!subscription?.currentPeriodEnd || subscription.currentPeriodEnd.getTime() !== invoice.periodEnd.getTime()) throw new Error('Seat payment belongs to another subscription period; support reconciliation required')
  await tx.subscription.update({ where: { companyId }, data: { seatCount: { increment: activation.addSeats } } })
  await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'PAID', paidAt: new Date() } })
  const creditApplied = Number(activation.creditApplied ?? 0)
  await spendCreditInTransaction(tx, { companyId, amount: creditApplied, invoiceId, invoiceNo: invoice.invoiceNo })
  return { status: 'succeeded', activated: true, creditApplied }
 }, { timeout: 30000 })
}
