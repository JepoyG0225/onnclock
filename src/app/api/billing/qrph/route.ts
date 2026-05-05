/**
 * POST /api/billing/qrph
 *
 * Creates a PayMongo QR Ph payment for a subscription upgrade.
 * Returns the QR code image (base64 data URL) and payment intent ID.
 * Subscription is NOT yet activated — activation happens after payment
 * is confirmed via /api/billing/qrph/status polling.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createQrPhPayment } from '@/lib/payments/paymongo'

const schema = z.object({
  billingCycle: z.enum(['ANNUAL']),
  seatCount: z.number().int().min(1),
  pricePerSeat: z.union([z.literal(50), z.literal(100)]).default(50),
})

/** Find the highest sequence number used this month (globally) and return the next one. */
async function nextInvoiceNo(): Promise<string> {
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const prefix = `INV-${ym}-`
  const last = await prisma.invoice.findFirst({
    where: { invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: 'desc' },
    select: { invoiceNo: true },
  })
  const seq = last ? parseInt(last.invoiceNo.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await req.json())
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { billingCycle, seatCount, pricePerSeat } = body

  // ── Resolve seat count ────────────────────────────────────────────────────
  const employeeCount = await prisma.employee.count({
    where: { companyId: ctx.companyId, isActive: true },
  })
  const billedSeatCount = Math.max(employeeCount, seatCount)

  // ── Compute invoice totals (Annual with 20% discount) ─────────────────────
  const now = new Date()
  const existingSub = await prisma.subscription.findUnique({
    where: { companyId: ctx.companyId },
    select: {
      id: true, status: true, billingCycle: true, pricePerSeat: true,
      seatCount: true, currentPeriodStart: true, currentPeriodEnd: true,
    },
  })

  const isAnnual = billingCycle === 'ANNUAL'
  const isSameCycleChange = existingSub?.billingCycle === billingCycle
  const hasActiveRemainingPeriod =
    existingSub?.status === 'ACTIVE' &&
    !!existingSub.currentPeriodEnd &&
    existingSub.currentPeriodEnd.getTime() > now.getTime()

  let periodStart = now
  let periodEnd = new Date(now)
  if (isAnnual) periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  else periodEnd.setMonth(periodEnd.getMonth() + 1)

  const newCycleTotal = isAnnual
    ? pricePerSeat * 12 * billedSeatCount * 0.8
    : pricePerSeat * billedSeatCount
  const subtotalBase = isAnnual ? pricePerSeat * 12 * billedSeatCount : pricePerSeat * billedSeatCount
  const discountPct = isAnnual ? 20 : 0
  const discountAmount = isAnnual ? subtotalBase * 0.2 : 0

  let subtotal = subtotalBase
  let remainingCredit = 0

  if (hasActiveRemainingPeriod && existingSub?.currentPeriodStart && existingSub.currentPeriodEnd) {
    const periodMs = Math.max(1, existingSub.currentPeriodEnd.getTime() - existingSub.currentPeriodStart.getTime())
    const remainingMs = Math.max(0, existingSub.currentPeriodEnd.getTime() - now.getTime())
    const remainingRatio = Math.min(1, remainingMs / periodMs)
    const oldCycleTotal = Number(existingSub.pricePerSeat) * 12 * Number(existingSub.seatCount) * 0.8
    remainingCredit = Math.round(oldCycleTotal * remainingRatio * 100) / 100

    if (isSameCycleChange) {
      const delta = Math.max(0, newCycleTotal - oldCycleTotal)
      const prorated = Math.round(delta * remainingRatio * 100) / 100
      subtotal = isAnnual ? Math.round((prorated / 0.8) * 100) / 100 : prorated
      periodStart = now
      periodEnd = existingSub.currentPeriodEnd
    } else {
      const net = Math.max(0, newCycleTotal - remainingCredit)
      subtotal = isAnnual ? Math.round((net / 0.8) * 100) / 100 : net
    }
  }

  const total = Math.max(0, Math.round((subtotal - (subtotal * discountPct / 100)) * 100) / 100)

  // ── Ensure subscription row exists ────────────────────────────────────────
  const sub = await prisma.subscription.upsert({
    where: { companyId: ctx.companyId },
    update: { updatedAt: new Date() },
    create: {
      id: `sub_${ctx.companyId}`,
      companyId: ctx.companyId,
      plan: 'TRIAL',
      status: 'TRIAL',
      updatedAt: new Date(),
    },
  })

  // ── Company details for PayMongo billing ──────────────────────────────────
  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { name: true, email: true },
  })

  // ── Invoice number (global max for this month) ────────────────────────────
  const invoiceNo = await nextInvoiceNo()
  const dueDate = new Date(now)
  dueDate.setDate(dueDate.getDate() + 7)

  // Subscription activation payload (stored in invoice notes; used by status
  // polling to activate the subscription once payment succeeds)
  const subscriptionActivationPayload = {
    plan: 'ANNUAL' as const,
    status: 'ACTIVE' as const,
    billingCycle,
    pricePerSeat,
    seatCount: billedSeatCount,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    skipPeriodReset: Boolean(hasActiveRemainingPeriod && isSameCycleChange),
  }

  // ── Create invoice FIRST (DRAFT) so the number is reserved ───────────────
  // We update it with the paymentIntentId after PayMongo responds.
  const invoice = await prisma.invoice.create({
    data: {
      id: `inv_${ctx.companyId}_${Date.now()}`,
      companyId: ctx.companyId,
      subscriptionId: sub.id,
      invoiceNo,
      status: 'UNPAID',
      periodStart,
      periodEnd,
      seatCount: billedSeatCount,
      pricePerSeat,
      subtotal,
      discountPct,
      discountAmount: subtotal * discountPct / 100,
      total,
      paymentMethodCode: 'QRPH',
      paymentMethodLabel: 'QR Ph (GCash / Maya)',
      dueDate,
      notes: JSON.stringify({
        paymentProvider: 'PAYMONGO_QRPH',
        paymentIntentId: null, // filled in after PayMongo responds
        prorationApplied: hasActiveRemainingPeriod,
        sameCycleProration: isSameCycleChange,
        remainingCredit,
        subscriptionActivationPayload,
      }),
      updatedAt: new Date(),
    },
  })

  // ── Now call PayMongo (invoice number already reserved above) ─────────────
  let qrResult: Awaited<ReturnType<typeof createQrPhPayment>>
  try {
    qrResult = await createQrPhPayment({
      amountPeso: total,
      description: `OnClock Annual Subscription — ${billedSeatCount} seat${billedSeatCount !== 1 ? 's' : ''}`,
      billingName: company?.name || 'Company',
      billingEmail: company?.email || ctx.email || 'billing@onclockph.com',
      metadata: {
        invoiceNo,
        invoiceId: invoice.id,
        companyId: ctx.companyId,
        subscriptionId: sub.id,
      },
    })
  } catch (err) {
    // PayMongo failed — void the invoice so the number is not wasted
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'VOID', updatedAt: new Date() },
    })
    console.error('[billing/qrph] PayMongo error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create QR payment' },
      { status: 502 },
    )
  }

  // ── Patch invoice with paymentIntentId ────────────────────────────────────
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      notes: JSON.stringify({
        paymentProvider: 'PAYMONGO_QRPH',
        paymentIntentId: qrResult.paymentIntentId,
        prorationApplied: hasActiveRemainingPeriod,
        sameCycleProration: isSameCycleChange,
        remainingCredit,
        subscriptionActivationPayload,
      }),
      updatedAt: new Date(),
    },
  })

  // QR codes expire 30 min after creation
  const expiresAt = new Date(now.getTime() + 29 * 60 * 1000).toISOString()

  return NextResponse.json({
    invoiceNo: invoice.invoiceNo,
    invoiceId: invoice.id,
    paymentIntentId: qrResult.paymentIntentId,
    qrImage: qrResult.qrImage,
    amountDue: total,
    expiresAt,
  })
}
