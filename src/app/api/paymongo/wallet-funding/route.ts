import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { advanceFunding, fundingConfigured, reconcileFunding } from '@/lib/disbursement/funding'
import { providerMode } from '@/lib/disbursement/provider'
import { verifySignature } from '@/lib/disbursement/webhook'

export const maxDuration = 300
/** Parent checkout webhook. Signed events are hints; provider reads establish payment and settlement. */
export async function POST(req: NextRequest) {
  const secret = process.env.PAYMONGO_FUNDING_WEBHOOK_SECRET
  if (!secret || !fundingConfigured()) return NextResponse.json({ error: 'Funding webhook unavailable.' }, { status: 503 })
  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('paymongo-signature') ?? '', secret, providerMode())) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
  }
  try {
    const event = JSON.parse(raw)?.data?.attributes
    if (event?.type !== 'checkout_session.payment.paid') return NextResponse.json({ received: true })
    const checkout = event.data
    if (!/^cs_[a-zA-Z0-9]+$/.test(checkout?.id ?? '')) return NextResponse.json({ error: 'Invalid checkout.' }, { status: 400 })
    const reference = checkout.attributes?.reference_number
    const row = await prisma.walletFunding.findUnique({ where: { id: typeof reference === 'string' ? reference : '' } })
    if (!row) return NextResponse.json({ received: true })
    if (!row.checkoutId && row.status === 'REVIEW') await reconcileFunding(row.companyId, row.id, checkout.id)
    await advanceFunding(row.id)
    return NextResponse.json({ received: true })
  } catch {
    // Provider/DB failures are retried by PayMongo and by the scheduled reconciler.
    return NextResponse.json({ error: 'Funding reconciliation temporarily unavailable.' }, { status: 503 })
  }
}
