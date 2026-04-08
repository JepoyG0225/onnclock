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
    },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const paymentMethods = await prisma.paymentMethod.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({
    invoice: {
      ...invoice,
      pricePerSeat: Number(invoice.pricePerSeat),
      subtotal: Number(invoice.subtotal),
      discountPct: Number(invoice.discountPct),
      discountAmount: Number(invoice.discountAmount),
      total: Number(invoice.total),
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
