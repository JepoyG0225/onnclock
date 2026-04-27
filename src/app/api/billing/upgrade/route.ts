import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { ensureDefaultPaymentMethods } from '@/lib/billing/payment-methods'
import { Prisma } from '@prisma/client'

const schema = z.object({
  billingCycle: z.enum(['ANNUAL']),
  seatCount: z.number().int().min(1),
  pricePerSeat: z.union([z.literal(50), z.literal(100)]).default(50),
  paymentMethodCode: z.string().min(1),
  proofOfPaymentDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/i)
    .max(2_500_000)
    .optional(),
})

function nextInvoiceNo(existing: string | null): string {
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const seq = existing
    ? (parseInt(existing.split('-')[2] ?? '0', 10) + 1)
    : 1
  return `INV-${ym}-${String(seq).padStart(4, '0')}`
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  let body: z.infer<typeof schema>
  try {
    const raw = await req.json()
    body = schema.parse(raw)
  } catch (err) {
    if (err instanceof ZodError) {
      const firstIssue = (err as ZodError).issues?.[0]
      return NextResponse.json(
        { error: firstIssue?.message ?? 'Invalid request data' },
        { status: 400 }
      )
    }
    // JSON parse failure — most likely the body exceeded Vercel's size limit
    return NextResponse.json(
      { error: 'Request body could not be parsed. The proof image may be too large — please use a smaller image.' },
      { status: 400 }
    )
  }
  const { billingCycle, seatCount, pricePerSeat, paymentMethodCode, proofOfPaymentDataUrl } = body

  const employeeCount = await prisma.employee.count({
    where: { companyId: ctx.companyId, isActive: true },
  })
  const billedSeatCount = Math.max(employeeCount, seatCount)

  await ensureDefaultPaymentMethods()
  const paymentMethod = await prisma.paymentMethod.findFirst({
    where: { code: paymentMethodCode, isActive: true },
    select: { code: true, label: true },
  })
  if (!paymentMethod) {
    return NextResponse.json({ error: 'Selected payment method is unavailable.' }, { status: 400 })
  }

  const now = new Date()
  const existingSub = await prisma.subscription.findUnique({
    where: { companyId: ctx.companyId },
    select: {
      id: true,
      status: true,
      billingCycle: true,
      pricePerSeat: true,
      seatCount: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  })

  const isAnnual = billingCycle === 'ANNUAL'

  const existingBillingCycle = existingSub?.billingCycle
  const isSameCycleChange = !!existingBillingCycle && existingBillingCycle === billingCycle
  const hasActiveRemainingPeriod =
    !!existingSub &&
    existingSub.status === 'ACTIVE' &&
    !!existingSub.currentPeriodStart &&
    !!existingSub.currentPeriodEnd &&
    existingSub.currentPeriodEnd.getTime() > now.getTime()

  const oldPricePerSeat = Number(existingSub?.pricePerSeat ?? 0)
  const oldSeatCount = Number(existingSub?.seatCount ?? 0)
  const oldIsAnnual = existingBillingCycle === 'ANNUAL'
  const oldCycleTotal = oldIsAnnual
    ? oldPricePerSeat * 12 * oldSeatCount * 0.8
    : oldPricePerSeat * oldSeatCount

  let periodStart = now
  let periodEnd = new Date(now)
  const newCycleSubtotal = isAnnual ? pricePerSeat * 12 * billedSeatCount : pricePerSeat * billedSeatCount
  const newCycleDiscountAmount = isAnnual ? newCycleSubtotal * 0.2 : 0
  const newCycleTotal = newCycleSubtotal - newCycleDiscountAmount

  let subtotal = newCycleSubtotal
  let discountPct = isAnnual ? 20 : 0
  let discountAmount = isAnnual ? subtotal * 0.2 : 0
  let remainingCredit = 0

  if (hasActiveRemainingPeriod && existingSub?.currentPeriodStart && existingSub.currentPeriodEnd) {
    const currentStart = existingSub.currentPeriodStart
    const currentEnd = existingSub.currentPeriodEnd

    const periodMs = Math.max(1, currentEnd.getTime() - currentStart.getTime())
    const remainingMs = Math.max(0, currentEnd.getTime() - now.getTime())
    const remainingRatio = Math.min(1, remainingMs / periodMs)
    remainingCredit = Math.round(oldCycleTotal * remainingRatio * 100) / 100

    if (isSameCycleChange) {
      // Same-cycle change: charge only the prorated difference for the remaining period.
      const currentPeriodOldTotal = oldCycleTotal
      const currentPeriodNewTotal = newCycleTotal
      const deltaTotal = Math.max(0, currentPeriodNewTotal - currentPeriodOldTotal)
      const proratedTotal = Math.round(deltaTotal * remainingRatio * 100) / 100

      // Keep the 20% annual discount line visible and consistent in invoice breakdown.
      subtotal = isAnnual ? Math.round((proratedTotal / 0.8) * 100) / 100 : proratedTotal
      discountPct = isAnnual ? 20 : 0
      discountAmount = isAnnual ? Math.round((subtotal - proratedTotal) * 100) / 100 : 0
      periodStart = now
      periodEnd = currentEnd
    } else {
      // Cross-cycle change (e.g., monthly -> annual): charge full new cycle minus remaining paid credit.
      const netTotal = Math.max(0, newCycleTotal - remainingCredit)
      subtotal = isAnnual ? Math.round((netTotal / 0.8) * 100) / 100 : netTotal
      discountPct = isAnnual ? 20 : 0
      discountAmount = isAnnual ? Math.round((subtotal - netTotal) * 100) / 100 : 0
      if (isAnnual) periodEnd.setFullYear(periodEnd.getFullYear() + 1)
      else periodEnd.setMonth(periodEnd.getMonth() + 1)
    }
  } else {
    if (isAnnual) {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1)
    }
  }

  const total = Math.max(0, subtotal - discountAmount)

  const dueDate = new Date(now)
  dueDate.setDate(dueDate.getDate() + 7)

  const lastInvoice = await prisma.invoice.findFirst({
    where: { companyId: ctx.companyId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNo: true },
  })
  const invoiceNo = nextInvoiceNo(lastInvoice?.invoiceNo ?? null)

  const updateData: Prisma.SubscriptionUpdateInput = {
    plan: 'ANNUAL',
    status: 'ACTIVE' as const,
    billingCycle,
    pricePerSeat,
    seatCount: billedSeatCount,
    ...(hasActiveRemainingPeriod && isSameCycleChange
      ? {}
      : {
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        }),
    trialEndsAt: null,
    cancelledAt: null,
    updatedAt: new Date(),
  }

  const sub = await prisma.subscription.upsert({
    where: { companyId: ctx.companyId },
    update: updateData,
    create: {
      id: `sub_${ctx.companyId}`,
      companyId: ctx.companyId,
      plan: 'ANNUAL',
      status: 'ACTIVE',
      billingCycle,
      pricePerSeat,
      seatCount: billedSeatCount,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      updatedAt: new Date(),
    },
  })

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
      discountAmount,
      total,
      paymentMethodCode: paymentMethod.code,
      paymentMethodLabel: paymentMethod.label,
      dueDate,
      notes: proofOfPaymentDataUrl
        ? JSON.stringify({
            proofOfPaymentDataUrl,
            proofUploadedAt: new Date().toISOString(),
            prorationApplied: hasActiveRemainingPeriod,
            sameCycleProration: isSameCycleChange,
            remainingCredit,
            existingSubscriptionId: existingSub?.id ?? null,
          })
        : null,
      updatedAt: new Date(),
    },
  })

  return NextResponse.json({ subscription: sub, invoice })
}
