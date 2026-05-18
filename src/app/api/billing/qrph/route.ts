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
import { computeCreditApplied } from '@/lib/billing/credit'

const schema = z.object({
  // Subscription duration. 3M and 6M are prepay plans at the standard
  // per-seat-per-month rate; ANNUAL adds a 20% discount on the 12-month
  // prepay (DOLE-Handbook-style: incentive for longer commitment).
  billingCycle: z.enum(['3_MONTH', '6_MONTH', 'ANNUAL']),
  seatCount: z.number().int().min(1),
  pricePerSeat: z.union([z.literal(50), z.literal(100)]).default(50),
})

const DURATION_MONTHS = { '3_MONTH': 3, '6_MONTH': 6, ANNUAL: 12 } as const
const DURATION_DISCOUNT_PCT = { '3_MONTH': 0, '6_MONTH': 0, ANNUAL: 20 } as const
const DURATION_LABEL = { '3_MONTH': '3-Month', '6_MONTH': '6-Month', ANNUAL: 'Annual' } as const

// Window during which an upgrade still credits the remaining value of the
// current subscription. After this many days from the cycle's start, the
// upgrade is billed at full price for the new plan — no proration credit.
// Rationale: a 10-day return policy is the closest analogue to PH consumer
// regulations and lets companies correct a wrong-tier purchase quickly
// without giving away open-ended credit for usage already consumed.
const PRORATION_WINDOW_DAYS = 10
const PRORATION_WINDOW_MS = PRORATION_WINDOW_DAYS * 24 * 60 * 60 * 1000

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

  const months = DURATION_MONTHS[billingCycle]
  const discountPct = DURATION_DISCOUNT_PCT[billingCycle]
  const cycleLabel = DURATION_LABEL[billingCycle]
  const isSameCycleChange = existingSub?.billingCycle === billingCycle
  // Proration only applies when ALL three are true:
  //   1. Subscription is currently ACTIVE
  //   2. The current cycle hasn't ended yet
  //   3. The current cycle started within the last PRORATION_WINDOW_DAYS
  // Past the window, the customer pays the full price for the new plan
  // and the unused value of the existing cycle is forfeit (same logic as
  // most SaaS no-refund policies after the trial/return window).
  const withinProrationWindow = Boolean(
    existingSub?.currentPeriodStart &&
    now.getTime() - existingSub.currentPeriodStart.getTime() <= PRORATION_WINDOW_MS,
  )
  const hasActiveRemainingPeriod =
    existingSub?.status === 'ACTIVE' &&
    !!existingSub.currentPeriodEnd &&
    existingSub.currentPeriodEnd.getTime() > now.getTime() &&
    withinProrationWindow

  let periodStart = now
  let periodEnd = new Date(now)
  periodEnd.setMonth(periodEnd.getMonth() + months)

  // ── Cycle total math (NEW) ────────────────────────────────────────────────
  // newCycleTotal = post-discount total for the new plan
  // subtotalBase  = pre-discount total (months × seats × pricePerSeat)
  const subtotalBase = pricePerSeat * months * billedSeatCount
  const newCycleTotal = subtotalBase * (1 - discountPct / 100)
  const discountAmount = subtotalBase * (discountPct / 100)

  let subtotal = subtotalBase
  let remainingCredit = 0

  if (hasActiveRemainingPeriod && existingSub?.currentPeriodStart && existingSub.currentPeriodEnd) {
    const periodMs = Math.max(1, existingSub.currentPeriodEnd.getTime() - existingSub.currentPeriodStart.getTime())
    const remainingMs = Math.max(0, existingSub.currentPeriodEnd.getTime() - now.getTime())
    const remainingRatio = Math.min(1, remainingMs / periodMs)
    // Honor whatever cycle the existing subscription was bought under so we
    // credit back the right pesos. Previously this assumed ANNUAL+0.8 even
    // when the company had paid for a 3M/6M plan.
    const existingCycle = (existingSub.billingCycle ?? 'ANNUAL') as keyof typeof DURATION_MONTHS
    const existingMonths = DURATION_MONTHS[existingCycle] ?? 12
    const existingDiscountFactor = 1 - (DURATION_DISCOUNT_PCT[existingCycle] ?? 0) / 100
    const oldCycleTotal = Number(existingSub.pricePerSeat) * existingMonths * Number(existingSub.seatCount) * existingDiscountFactor
    remainingCredit = Math.round(oldCycleTotal * remainingRatio * 100) / 100

    const discountFactor = 1 - discountPct / 100
    if (isSameCycleChange) {
      const delta = Math.max(0, newCycleTotal - oldCycleTotal)
      const prorated = Math.round(delta * remainingRatio * 100) / 100
      subtotal = discountFactor > 0 ? Math.round((prorated / discountFactor) * 100) / 100 : prorated
      periodStart = now
      periodEnd = existingSub.currentPeriodEnd
    } else {
      const net = Math.max(0, newCycleTotal - remainingCredit)
      subtotal = discountFactor > 0 ? Math.round((net / discountFactor) * 100) / 100 : net
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

  // ── Apply billing credit ──────────────────────────────────────────────────
  // Credit accrues when employees are deactivated mid-cycle (see
  // src/lib/billing/credit.ts). Applied to the total here; the actual
  // decrement happens in the status route after PayMongo confirms the
  // payment so we don't burn credit on abandoned QR sessions.
  const creditBalance = Number(
    (sub as unknown as { creditBalance?: { toNumber(): number } | number }).creditBalance ?? 0,
  )
  const creditApplied = computeCreditApplied(
    typeof creditBalance === 'object' && creditBalance !== null
      ? (creditBalance as { toNumber(): number }).toNumber()
      : creditBalance,
    total,
  )
  const totalAfterCredit = Math.max(0, parseFloat((total - creditApplied).toFixed(2)))

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
  // polling to activate the subscription once payment succeeds).
  //
  // The Prisma SubscriptionPlan enum only allows TRIAL | MONTHLY | ANNUAL.
  // The actual billing cycle (3M / 6M / ANNUAL) is preserved in the
  // separate billingCycle field. We map 3M/6M → MONTHLY for the enum so
  // we don't need a Prisma migration; downstream code that needs the
  // real cycle should read `billingCycle`, not `plan`.
  const subscriptionActivationPayload = {
    plan: (billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY') as 'ANNUAL' | 'MONTHLY',
    status: 'ACTIVE' as const,
    billingCycle,
    pricePerSeat,
    seatCount: billedSeatCount,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    skipPeriodReset: Boolean(hasActiveRemainingPeriod && isSameCycleChange),
    // Credit consumed by this invoice. The status route decrements
    // Subscription.creditBalance by this amount once PayMongo confirms.
    creditApplied,
  }

  // ── Create invoice as VOID (payment session) so the number is reserved ──────
  // Status stays VOID until PayMongo confirms payment; then it's set to PAID.
  // VOID invoices with paidAt=null are treated as "initiated but not yet paid"
  // and are not shown to users as real invoices.
  const invoice = await prisma.invoice.create({
    data: {
      id: `inv_${ctx.companyId}_${Date.now()}`,
      companyId: ctx.companyId,
      subscriptionId: sub.id,
      invoiceNo,
      status: 'VOID',
      periodStart,
      periodEnd,
      seatCount: billedSeatCount,
      pricePerSeat,
      subtotal,
      discountPct,
      discountAmount: subtotal * discountPct / 100,
      total: totalAfterCredit,
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
      amountPeso: totalAfterCredit,
      description: `OnClock ${cycleLabel} Subscription — ${billedSeatCount} seat${billedSeatCount !== 1 ? 's' : ''}`,
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
    amountDue: totalAfterCredit,
    creditApplied,
    expiresAt,
  })
}
