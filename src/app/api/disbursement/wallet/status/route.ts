import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getPaymentIntentStatus } from '@/lib/payments/paymongo'

/**
 * GET /api/disbursement/wallet/status?topUpId=xxx
 * Poll a pending top-up and confirm it once PayMongo reports success.
 */
export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const topUpId = searchParams.get('topUpId')
  if (!topUpId) return NextResponse.json({ error: 'topUpId required' }, { status: 400 })

  const topUp = await prisma.disbursementTopUp.findFirst({
    where: { id: topUpId, companyId: ctx.companyId },
  })
  if (!topUp) return NextResponse.json({ error: 'Top-up not found' }, { status: 404 })

  // Already settled
  if (topUp.status === 'CONFIRMED') {
    return NextResponse.json({ status: 'CONFIRMED', amountPeso: topUp.amountPeso.toNumber() })
  }
  if (topUp.status === 'FAILED') {
    return NextResponse.json({ status: 'FAILED' })
  }

  // Check expiry
  if (topUp.expiresAt && topUp.expiresAt < new Date()) {
    await prisma.disbursementTopUp.update({
      where: { id: topUpId },
      data: { status: 'EXPIRED' },
    })
    return NextResponse.json({ status: 'EXPIRED' })
  }

  // Poll PayMongo
  if (!topUp.paymentIntentId) {
    return NextResponse.json({ status: topUp.status })
  }

  const { status: pmStatus } = await getPaymentIntentStatus(topUp.paymentIntentId)

  if (pmStatus === 'succeeded') {
    // Confirm top-up and credit disbursement balance atomically
    await prisma.$transaction([
      prisma.disbursementTopUp.update({
        where: { id: topUpId },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      }),
      prisma.company.update({
        where: { id: ctx.companyId },
        data: {
          disbursementBalance: { increment: topUp.amountPeso },
        },
      }),
    ])
    return NextResponse.json({ status: 'CONFIRMED', amountPeso: topUp.amountPeso.toNumber() })
  }

  if (pmStatus === 'failed' || pmStatus === 'cancelled') {
    await prisma.disbursementTopUp.update({
      where: { id: topUpId },
      data: { status: 'FAILED' },
    })
    return NextResponse.json({ status: 'FAILED' })
  }

  return NextResponse.json({ status: 'PENDING' })
}
