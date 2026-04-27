import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { ensureDefaultPaymentMethods } from '@/lib/billing/payment-methods'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  await ensureDefaultPaymentMethods()

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      company: {
        select: { name: true, email: true, address: true, city: true, province: true, phone: true, tin: true },
      },
      subscription: {
        select: { seatCount: true, pricePerSeat: true },
      },
    },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const paymentMethods = await prisma.paymentMethod.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  const rawPricePerSeat = Number(invoice.pricePerSeat)
  const rawSeatCount = Number(invoice.seatCount)
  const fallbackPricePerSeat = Number(invoice.subscription?.pricePerSeat ?? 0)
  const fallbackSeatCount = Number(invoice.subscription?.seatCount ?? 0)
  const effectivePricePerSeat = rawPricePerSeat > 0 ? rawPricePerSeat : fallbackPricePerSeat
  const monthsBilled = Number(invoice.discountPct) > 0 ? 12 : 1

  let effectiveSeatCount = rawSeatCount > 0 ? rawSeatCount : fallbackSeatCount
  if (effectiveSeatCount <= 0 && effectivePricePerSeat > 0) {
    const estimatedSeats = Math.round(Number(invoice.subtotal) / (effectivePricePerSeat * monthsBilled))
    effectiveSeatCount = Math.max(1, estimatedSeats)
  }

  return NextResponse.json({
    invoice: {
      ...invoice,
      pricePerSeat: rawPricePerSeat,
      subtotal: Number(invoice.subtotal),
      discountPct: Number(invoice.discountPct),
      discountAmount: Number(invoice.discountAmount),
      total: Number(invoice.total),
      effectivePricePerSeat,
      effectiveSeatCount,
      monthsBilled,
    },
    paymentMethods,
  })
}

// Mark invoice as PAID (admin action for manual billing)
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.invoice.update({
    where: { id },
    data: { status: 'PAID', paidAt: new Date(), updatedAt: new Date() },
  })

  return NextResponse.json({ invoice: updated })
}
