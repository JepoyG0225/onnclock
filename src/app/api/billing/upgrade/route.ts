import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { ensureDefaultPaymentMethods } from '@/lib/billing/payment-methods'

const schema = z.object({
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']),
  seatCount: z.number().int().min(1),
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

  const body = schema.parse(await req.json())
  const { billingCycle, seatCount, paymentMethodCode, proofOfPaymentDataUrl } = body

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

  const pricePerSeat = 50
  const isAnnual = billingCycle === 'ANNUAL'
  const discountPct = isAnnual ? 20 : 0
  const discountAmount = isAnnual ? pricePerSeat * billedSeatCount * 12 * 0.2 : 0
  const subtotal = isAnnual
    ? pricePerSeat * 12 * billedSeatCount
    : pricePerSeat * billedSeatCount
  const total = subtotal - discountAmount

  const now = new Date()
  const periodStart = now
  const periodEnd = new Date(now)
  if (isAnnual) {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1)
  }

  const dueDate = new Date(now)
  dueDate.setDate(dueDate.getDate() + 7)

  const lastInvoice = await prisma.invoice.findFirst({
    where: { companyId: ctx.companyId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNo: true },
  })
  const invoiceNo = nextInvoiceNo(lastInvoice?.invoiceNo ?? null)

  const sub = await prisma.subscription.upsert({
    where: { companyId: ctx.companyId },
    update: {
      plan: isAnnual ? 'ANNUAL' : 'MONTHLY',
      status: 'ACTIVE',
      billingCycle,
      pricePerSeat,
      seatCount: billedSeatCount,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      trialEndsAt: null,
      cancelledAt: null,
      updatedAt: new Date(),
    },
    create: {
      id: `sub_${ctx.companyId}`,
      companyId: ctx.companyId,
      plan: isAnnual ? 'ANNUAL' : 'MONTHLY',
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
          })
        : null,
      updatedAt: new Date(),
    },
  })

  return NextResponse.json({ subscription: sub, invoice })
}
