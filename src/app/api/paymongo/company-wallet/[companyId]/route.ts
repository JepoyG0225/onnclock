import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { unseal } from '@/lib/disbursement/crypto'
import { verifySignature } from '@/lib/disbursement/webhook'
import { syncCompanyWallet } from '@/lib/disbursement/wallet'

export async function POST(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const wallet = await prisma.companyPaymongoWallet.findUnique({ where: { companyId } })
  if (!wallet?.webhookSecretEncrypted) return NextResponse.json({ error: 'Unknown webhook.' }, { status: 404 })
  const raw = await req.text()
  if (raw.length > 256000 || !verifySignature(raw, req.headers.get('paymongo-signature') ?? '', unseal<string>(wallet.webhookSecretEncrypted), wallet.livemode)) return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
  try {
    // Fetch current provider truth instead of applying event payloads. Duplicate and
    // out-of-order deliveries cannot regress state or create financial side effects.
    await syncCompanyWallet(companyId)
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: 'Verification refresh failed; retry delivery.' }, { status: 503 })
  }
}
