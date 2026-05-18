/**
 * POST /api/billing/qrph/add-seats
 *
 * Lets a company purchase additional seats on their CURRENT subscription
 * cycle. The cost is pro-rated to the remaining cycle days so a company
 * that adds 3 seats halfway through a 12-month plan pays for 6 months of
 * those 3 extra seats.
 *
 * Cycle period dates are NOT touched — only `Subscription.seatCount` is
 * incremented when payment succeeds (handled in the existing status route
 * via the addSeats activation payload).
 *
 * Restrictions:
 *   - Subscription must be ACTIVE (TRIAL companies should purchase a full
 *     cycle first via /api/billing/qrph)
 *   - additionalSeats must be a positive integer
 *
 * Pricing math (preserves the cycle's discount factor):
 *   perSeatMonthly = pricePerSeat × (1 − discount/100)
 *   cycleTotalForOne = perSeatMonthly × cycleMonths
 *   remainingRatio = (periodEnd − now) / (periodEnd − periodStart)   // 0–1
 *   subtotalBase   = additionalSeats × cycleMonths × pricePerSeat × remainingRatio
 *   discount       = subtotalBase × discountPct / 100
 *   total          = subtotalBase − discount
 */

import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createQrPhPayment } from '@/lib/payments/paymongo'

const schema = z.object({
  additionalSeats: z.number().int().min(1).max(1_000),
})

const DURATION_MONTHS = { '3_MONTH': 3, '6_MONTH': 6, ANNUAL: 12, MONTHLY: 1 } as const
const DURATION_DISCOUNT_PCT = { '3_MONTH': 0, '6_MONTH': 0, ANNUAL: 20, MONTHLY: 0 } as const

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
  const { additionalSeats } = body

  // ── Resolve current subscription ───────────────────────────────────────
  const sub = await prisma.subscription.findUnique({
    where: { companyId: ctx.companyId },
    select: {
      id: true, status: true, billingCycle: true, pricePerSeat: true,
      seatCount: true, currentPeriodStart: true, currentPeriodEnd: true,
    },
  })
  if (!sub || sub.status !== 'ACTIVE') {
    return NextResponse.json(
      { error: 'Add-seats requires an ACTIVE subscription. Please subscribe to a plan first.' },
      { status: 400 },
    )
  }
  if (!sub.currentPeriodStart || !sub.currentPeriodEnd) {
    return NextResponse.json(
      { error: 'Subscription period is incomplete. Contact support.' },
      { status: 400 },
    )
  }

  const now = new Date()
  const cycleKey = (sub.billingCycle ?? 'ANNUAL') as keyof typeof DURATION_MONTHS
  const cycleMonths = DURATION_MONTHS[cycleKey] ?? 12
  const discountPct = DURATION_DISCOUNT_PCT[cycleKey] ?? 0
  const pricePerSeat = Number(sub.pricePerSeat)

  // ── Pro-rated cost ─────────────────────────────────────────────────────
  const totalCycleMs = Math.max(1, sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime())
  const remainingMs = Math.max(0, sub.currentPeriodEnd.getTime() - now.getTime())
  const remainingRatio = Math.min(1, remainingMs / totalCycleMs)
  if (remainingRatio <= 0) {
    return NextResponse.json(
      { error: 'Your current cycle has ended. Please renew before adding seats.' },
      { status: 400 },
    )
  }

  const subtotalBase = parseFloat(
    (additionalSeats * cycleMonths * pricePerSeat * remainingRatio).toFixed(2),
  )
  const discountAmount = parseFloat((subtotalBase * discountPct / 100).toFixed(2))
  const total = Math.max(0, parseFloat((subtotalBase - discountAmount).toFixed(2)))

  // ── Company info for PayMongo ──────────────────────────────────────────
  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { name: true, email: true },
  })

  // ── Invoice ────────────────────────────────────────────────────────────
  const invoiceNo = await nextInvoiceNo()
  const dueDate = new Date(now)
  dueDate.setDate(dueDate.getDate() + 7)

  // Activation payload carries `addSeats` so the status route knows to
  // increment Subscription.seatCount instead of replacing the whole plan.
  // Period dates are intentionally omitted — the seats attach to the
  // existing cycle and expire alongside it.
  const subscriptionActivationPayload = {
    addSeats: additionalSeats,
    pricePerSeat,
    billingCycle: cycleKey,
    status: 'ACTIVE' as const,
  }

  const invoice = await prisma.invoice.create({
    data: {
      id: `inv_${ctx.companyId}_${Date.now()}`,
      companyId: ctx.companyId,
      subscriptionId: sub.id,
      invoiceNo,
      status: 'VOID',
      periodStart: now,
      periodEnd: sub.currentPeriodEnd,
      seatCount: additionalSeats,
      pricePerSeat,
      subtotal: subtotalBase,
      discountPct,
      discountAmount,
      total,
      paymentMethodCode: 'QRPH',
      paymentMethodLabel: 'QR Ph (GCash / Maya)',
      dueDate,
      notes: JSON.stringify({
        paymentProvider: 'PAYMONGO_QRPH',
        paymentIntentId: null,
        addSeatsRequest: {
          additionalSeats,
          remainingRatio,
          cycleMonths,
          discountPct,
        },
        subscriptionActivationPayload,
      }),
      updatedAt: new Date(),
    },
  })

  // ── PayMongo QR ────────────────────────────────────────────────────────
  let qrResult: Awaited<ReturnType<typeof createQrPhPayment>>
  try {
    qrResult = await createQrPhPayment({
      amountPeso: total,
      description: `OnClock — Add ${additionalSeats} seat${additionalSeats === 1 ? '' : 's'} (pro-rated for ${remainingMs >= 0 ? Math.round(remainingMs / 86_400_000) : 0} days remaining)`,
      billingName: company?.name || 'Company',
      billingEmail: company?.email || ctx.email || 'billing@onclockph.com',
      metadata: {
        invoiceNo,
        invoiceId: invoice.id,
        companyId: ctx.companyId,
        subscriptionId: sub.id,
        flow: 'add-seats',
      },
    })
  } catch (err) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'VOID', updatedAt: new Date() },
    })
    console.error('[billing/qrph/add-seats] PayMongo error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create QR payment' },
      { status: 502 },
    )
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      notes: JSON.stringify({
        paymentProvider: 'PAYMONGO_QRPH',
        paymentIntentId: qrResult.paymentIntentId,
        addSeatsRequest: { additionalSeats, remainingRatio, cycleMonths, discountPct },
        subscriptionActivationPayload,
      }),
      updatedAt: new Date(),
    },
  })

  const expiresAt = new Date(now.getTime() + 29 * 60 * 1000).toISOString()
  return NextResponse.json({
    invoiceNo: invoice.invoiceNo,
    invoiceId: invoice.id,
    paymentIntentId: qrResult.paymentIntentId,
    qrImage: qrResult.qrImage,
    amountDue: total,
    additionalSeats,
    expiresAt,
  })
}
