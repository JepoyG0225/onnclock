import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const PAID_STATUSES = new Set(['paid', 'succeeded', 'success', 'completed', 'payment_success', 'authorized'])
const VOID_STATUSES = new Set(['void', 'cancelled', 'canceled', 'refunded', 'failed'])

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function resolveInvoiceReference(payload: Record<string, unknown>): { invoiceNo?: string; invoiceId?: string } {
  const data = (payload.data ?? {}) as Record<string, unknown>
  const metadata = (data.metadata ?? payload.metadata ?? {}) as Record<string, unknown>

  const invoiceNo = String(
    metadata.invoiceNo ??
    data.invoiceNo ??
    data.requestReferenceNumber ??
    ((data.attributes as Record<string, unknown> | undefined)?.requestReferenceNumber ?? '') ??
    payload.invoiceNo ??
    metadata.invoice_number ??
    data.invoice_number ??
    payload.invoice_number ??
    ''
  ).trim()

  const invoiceId = String(
    metadata.invoiceId ??
    data.invoiceId ??
    payload.invoiceId ??
    metadata.invoice_id ??
    data.invoice_id ??
    payload.invoice_id ??
    ''
  ).trim()

  return {
    invoiceNo: invoiceNo || undefined,
    invoiceId: invoiceId || undefined,
  }
}

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

function parseActivationPayload(invoiceNotes: string | null): ActivationPayload | null {
  if (!invoiceNotes) return null
  try {
    const parsed = JSON.parse(invoiceNotes) as { subscriptionActivationPayload?: ActivationPayload }
    return parsed?.subscriptionActivationPayload ?? null
  } catch {
    return null
  }
}

function resolvePaymentStatus(payload: Record<string, unknown>): string {
  const data = (payload.data ?? {}) as Record<string, unknown>
  return normalizeText(
    data.status ??
    payload.status ??
    data.paymentStatus ??
    payload.paymentStatus ??
    data.payment_status ??
    payload.payment_status
  )
}

function resolveEventType(payload: Record<string, unknown>): string {
  return String(payload.type ?? payload.event ?? payload.eventType ?? payload.event_type ?? 'unknown')
}

export async function POST(req: NextRequest) {
  const configuredSecret = process.env.PAYMENT_WEBHOOK_SECRET?.trim()
  if (configuredSecret) {
    const incomingSecret =
      req.headers.get('x-payment-webhook-secret') ||
      req.headers.get('x-webhook-secret') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      ''
    if (incomingSecret.trim() !== configuredSecret) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }
  }

  const payload = await req.json().catch(() => null)
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const eventType = resolveEventType(payload as Record<string, unknown>)
  const paymentStatus = resolvePaymentStatus(payload as Record<string, unknown>)
  const { invoiceNo, invoiceId } = resolveInvoiceReference(payload as Record<string, unknown>)

  if (!invoiceNo && !invoiceId) {
    return NextResponse.json({
      received: true,
      ignored: true,
      reason: 'No invoice reference found in payload',
      eventType,
    })
  }

  const invoice = invoiceNo
    ? await prisma.invoice.findUnique({ where: { invoiceNo } })
    : await prisma.invoice.findUnique({ where: { id: invoiceId as string } })

  if (!invoice) {
    return NextResponse.json({
      received: true,
      ignored: true,
      reason: 'Invoice not found',
      invoiceNo: invoiceNo ?? null,
      invoiceId: invoiceId ?? null,
      eventType,
    })
  }

  if (PAID_STATUSES.has(paymentStatus)) {
    const activation = parseActivationPayload(invoice.notes)

    if (activation) {
      const subscriptionUpdateData: Prisma.SubscriptionUpdateInput = {
        plan: activation.plan,
        status: activation.status,
        billingCycle: activation.billingCycle,
        pricePerSeat: activation.pricePerSeat,
        seatCount: activation.seatCount,
        trialEndsAt: null,
        cancelledAt: null,
      }
      if (!activation.skipPeriodReset) {
        subscriptionUpdateData.currentPeriodStart = new Date(activation.periodStart)
        subscriptionUpdateData.currentPeriodEnd = new Date(activation.periodEnd)
      }

      await prisma.subscription.upsert({
        where: { companyId: invoice.companyId },
        update: subscriptionUpdateData,
        create: {
          id: `sub_${invoice.companyId}`,
          companyId: invoice.companyId,
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
      where: { id: invoice.id },
      data: {
        status: 'PAID',
        paidAt: invoice.paidAt ?? new Date(),
      },
    })
    return NextResponse.json({
      received: true,
      updated: true,
      invoiceNo: invoice.invoiceNo,
      status: 'PAID',
      eventType,
    })
  }

  if (VOID_STATUSES.has(paymentStatus)) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'VOID',
      },
    })
    return NextResponse.json({
      received: true,
      updated: true,
      invoiceNo: invoice.invoiceNo,
      status: 'VOID',
      eventType,
    })
  }

  return NextResponse.json({
    received: true,
    ignored: true,
    reason: 'Unhandled payment status',
    paymentStatus,
    invoiceNo: invoice.invoiceNo,
    eventType,
  })
}
