import { NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  const invoices = await prisma.invoice.findMany({
    where: {
      companyId: ctx.companyId,
      // Exclude VOID invoices that were never paid — these are abandoned QR Ph
      // payment sessions (created as VOID, paidAt=null). Real voided invoices
      // (e.g. refunds) will have paidAt set.
      NOT: { status: 'VOID', paidAt: null },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      invoiceNo: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      seatCount: true,
      pricePerSeat: true,
      subtotal: true,
      discountPct: true,
      discountAmount: true,
      total: true,
      paymentMethodCode: true,
      paymentMethodLabel: true,
      dueDate: true,
      paidAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    invoices: invoices.map(inv => ({
      ...inv,
      pricePerSeat: Number(inv.pricePerSeat),
      subtotal: Number(inv.subtotal),
      discountPct: Number(inv.discountPct),
      discountAmount: Number(inv.discountAmount),
      total: Number(inv.total),
    })),
  })
}
