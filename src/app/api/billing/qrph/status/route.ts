/**
 * GET /api/billing/qrph/status?intentId=pi_xxx
 *
 * Polls PayMongo for the payment intent status.
 * When succeeded → activates subscription + marks invoice PAID (idempotent).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getPaymentIntentStatus } from '@/lib/payments/paymongo'
import { Prisma } from '@prisma/client'

type ActivationPayload = {
  plan: 'ANNUAL'
  status: 'ACTIVE'
  billingCycle: 'ANNUAL'
  pricePerSeat: number
  seatCount: number
  periodStart: string
  periodEnd: string
  skipPeriodReset?: boolean
}

function parseNotes(notes: string | null): { paymentIntentId?: string; subscriptionActivationPayload?: ActivationPayload } {
  if (!notes) return {}
  try { return JSON.parse(notes) } catch { return {} }
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  const intentId = req.nextUrl.searchParams.get('intentId')?.trim()
  if (!intentId) {
    return NextResponse.json({ error: 'intentId is required' }, { status: 400 })
  }

  // Find the invoice with this payment intent ID
  const invoices = await prisma.invoice.findMany({
    where: { companyId: ctx.companyId, status: { in: ['UNPAID', 'PAID'] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  const matchedInvoice = invoices.find((inv) => {
    const { paymentIntentId } = parseNotes(inv.notes)
    return paymentIntentId === intentId
  })

  if (!matchedInvoice) {
    return NextResponse.json({ error: 'Payment intent not found for this account' }, { status: 404 })
  }

  // If already paid, return success immediately (idempotent)
  if (matchedInvoice.status === 'PAID') {
    return NextResponse.json({ status: 'succeeded', alreadyActivated: true })
  }

  // Poll PayMongo
  let pmStatus: string
  try {
    const result = await getPaymentIntentStatus(intentId)
    pmStatus = result.status
  } catch (err) {
    console.error('[billing/qrph/status] PayMongo poll error:', err)
    return NextResponse.json({ error: 'Failed to check payment status' }, { status: 502 })
  }

  // If payment succeeded → activate subscription + mark invoice paid
  if (pmStatus === 'succeeded') {
    const { subscriptionActivationPayload: activation } = parseNotes(matchedInvoice.notes)

    if (activation) {
      const subUpdateData: Prisma.SubscriptionUpdateInput = {
        plan: activation.plan,
        status: activation.status,
        billingCycle: activation.billingCycle,
        pricePerSeat: activation.pricePerSeat,
        seatCount: activation.seatCount,
        trialEndsAt: null,
        cancelledAt: null,
        updatedAt: new Date(),
      }
      if (!activation.skipPeriodReset) {
        subUpdateData.currentPeriodStart = new Date(activation.periodStart)
        subUpdateData.currentPeriodEnd = new Date(activation.periodEnd)
      }

      await prisma.subscription.upsert({
        where: { companyId: ctx.companyId },
        update: subUpdateData,
        create: {
          id: `sub_${ctx.companyId}`,
          companyId: ctx.companyId,
          plan: activation.plan,
          status: activation.status,
          billingCycle: activation.billingCycle,
          pricePerSeat: activation.pricePerSeat,
          seatCount: activation.seatCount,
          currentPeriodStart: new Date(activation.periodStart),
          currentPeriodEnd: new Date(activation.periodEnd),
        },
      })
    }

    await prisma.invoice.update({
      where: { id: matchedInvoice.id },
      data: { status: 'PAID', paidAt: new Date() },
    })

    return NextResponse.json({ status: 'succeeded', activated: true, invoiceNo: matchedInvoice.invoiceNo })
  }

  // Map PayMongo statuses to simpler client-facing values
  const statusMap: Record<string, string> = {
    awaiting_payment_method: 'pending',
    awaiting_next_action: 'pending',
    processing: 'pending',
    succeeded: 'succeeded',
    failed: 'failed',
  }

  return NextResponse.json({
    status: statusMap[pmStatus] ?? pmStatus,
    invoiceNo: matchedInvoice.invoiceNo,
  })
}
