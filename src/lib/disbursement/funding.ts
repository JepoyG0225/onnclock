import { Prisma, type WalletFunding } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { onboardingConfigured, provider, providerMode, type ProviderWallet } from './provider'
import { readyWallet } from './wallet'

type Account = { number: string; name: string; bic: string }
type Payment = { id: string; attributes: {
  amount: number; currency: string; livemode: boolean; status: string
  disputed?: boolean; refunds?: unknown[]; payout?: { id?: string }
} }
type Checkout = { id: string; attributes: {
  checkout_url: string; reference_number: string; livemode: boolean; status: string
  metadata?: Record<string, string>; payments?: Payment[]
  line_items: { amount: number; quantity: number; currency: string }[]
} }
type Transfer = { id: string; amount: number; currency: string; status: string; fee?: number
  reference_number: string; provider: string; source_account: Account; destination_account: Account }
type Payout = { id: string; attributes: { status: string; currency: string
  bank_account_number: string; organization: { id: string } } }
type Settlement = { id: string; type: string; attributes: {
  amount: number; net_amount: number; currency: string; livemode: boolean
  organization_id: string; payout_id: string
} }

export function forwardingFeeCentavos() {
  const raw = process.env.PAYMONGO_TOPUP_TRANSFER_FEE_CENTAVOS
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) return null
  return Number(raw)
}
export function fundingConfigured() {
  return onboardingConfigured() && process.env.PAYMONGO_AUTOMATIC_TOPUPS_ENABLED === 'true' &&
    !!process.env.PAYMONGO_MAIN_WALLET_ID &&
    forwardingFeeCentavos() !== null
}
export function publicFunding(row: WalletFunding) {
  return { id: row.id, amountPeso: row.amountCentavos / 100, status: row.status,
    feePolicy: row.feePolicy, checkoutUrl: row.status === 'PAYMENT_PENDING' ? row.checkoutUrl : null,
    netPeso: row.netCentavos == null ? null : row.netCentavos / 100,
    creditPeso: row.creditCentavos == null ? null : row.creditCentavos / 100,
    paymentFeesPeso: row.netCentavos == null ? null : (row.amountCentavos - row.netCentavos) / 100,
    transferFeePeso: row.transferFee == null ? null : row.transferFee / 100,
    error: row.error, createdAt: row.createdAt, completedAt: row.completedAt }
}
function context(row: WalletFunding) {
  if (!fundingConfigured()) throw new Error('Automatic top-ups are awaiting platform configuration.')
  if (row.livemode !== providerMode() || row.parentAccountId !== process.env.PAYMONGO_PARENT_ACCOUNT_ID) throw new Error('Top-up provider account or mode changed. Reconciliation is required.')
}
async function parentWallet() {
  const result = await provider<{ data: ProviderWallet[] }>('GET', '/v2/wallets?fields=balance&fields=account')
  const wallet = result.data.find(w => w.id === process.env.PAYMONGO_MAIN_WALLET_ID &&
    w.merchant_id === process.env.PAYMONGO_PARENT_ACCOUNT_ID && w.livemode === providerMode())
  if (!wallet || wallet.status !== 'activated' || wallet.account?.currency !== 'PHP' ||
    !Number.isSafeInteger(wallet.balance?.available)) throw new Error('The main PHP wallet is unavailable.')
  const account = wallet.source_account ?? { number: wallet.account.account_number,
    name: wallet.account.account_name, bic: process.env.PAYMONGO_WALLET_BIC ?? '' }
  if (!account.number || !account.name || !account.bic) throw new Error('Main wallet bank details are missing.')
  return { wallet, account }
}
function sameAccount(a: Account, b: Account) {
  return a?.number === b?.number && a?.bic === b?.bic
}
export function checkCheckout(row: WalletFunding, checkout: Checkout) {
  const a = checkout?.attributes
  if (!/^cs_[a-zA-Z0-9]+$/.test(checkout?.id ?? '') || (row.checkoutId && checkout.id !== row.checkoutId) ||
    a?.reference_number !== row.id || a?.livemode !== row.livemode ||
    a?.metadata?.companyId !== row.companyId || a?.metadata?.fundingId !== row.id ||
    a?.line_items?.length !== 1 || a.line_items[0].amount !== row.amountCentavos ||
    a.line_items[0].quantity !== 1 || a.line_items[0].currency !== 'PHP') throw new Error('Checkout does not match this company top-up.')
  const url = new URL(a.checkout_url)
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.paymongo.com') throw new Error('Invalid checkout address.')
}
export function checkSettlement(row: WalletFunding, payout: Payout, transaction: Settlement) {
  const a = payout.attributes, t = transaction.attributes
  if (payout.id !== row.payoutId || a.status !== 'deposited' || a.currency !== 'PHP' ||
    a.organization?.id !== row.parentAccountId ||
    a.bank_account_number !== (row.sourceAccount as Account).number ||
    transaction.type !== 'payment' || transaction.id !== row.paymentId ||
    t.payout_id !== row.payoutId || t.organization_id !== row.parentAccountId ||
    t.livemode !== row.livemode || t.currency !== 'PHP' || t.amount !== row.amountCentavos ||
    !Number.isSafeInteger(t.net_amount) || t.net_amount <= 0 || t.net_amount > row.amountCentavos) {
    throw new Error('Payment settlement does not match the top-up and main wallet.')
  }
  if (row.feePolicy === 'GROSS') return row.amountCentavos // Preserve previously agreed funding records.
  if (row.feePolicy !== 'NET' || row.transferFee == null || !Number.isSafeInteger(row.transferFee) || row.transferFee < 0) {
    throw new Error('The forwarding fee must be confirmed before transferring this top-up.')
  }
  const credit = t.net_amount - row.transferFee
  if (credit <= 0) throw new Error('Top-up settlement does not cover the forwarding fee.')
  return credit
}
export function checkTransfer(row: WalletFunding, batch: { id: string; transfers: Transfer[] }) {
  const transfer = batch?.transfers?.find(t => t.reference_number === row.id)
  if ((row.batchId && batch.id !== row.batchId) || !/^btr_[a-zA-Z0-9]+$/.test(batch?.id ?? '') ||
    batch.transfers?.length !== 1 || !transfer?.id || (row.transferId && transfer.id !== row.transferId) ||
    transfer.amount !== row.creditCentavos || transfer.currency !== 'PHP' || transfer.provider !== 'paymongo' ||
    !sameAccount(transfer.source_account, row.sourceAccount as Account) ||
    !sameAccount(transfer.destination_account, row.destinationAccount as Account)) throw new Error('Wallet transfer does not match the top-up.')
  return transfer
}
async function saveTransfer(row: WalletFunding, batch: { id: string; transfers: Transfer[] }) {
  const t = checkTransfer(row, batch)
  const expectedFee = row.feePolicy === 'NET' && row.netCentavos != null && row.creditCentavos != null
    ? row.netCentavos - row.creditCentavos : null
  const feeMismatch = expectedFee !== null && (t.fee == null || t.fee !== expectedFee)
  const status = t.status === 'succeeded' ? (feeMismatch ? 'REVIEW' : 'COMPLETED') : t.status === 'failed' ? 'REVIEW' : 'TRANSFERRING'
  await prisma.walletFunding.updateMany({ where: { id: row.id, status: { in: ['TRANSFERRING', 'REVIEW'] }, updatedAt: row.updatedAt },
    data: { batchId: batch.id, transferId: t.id, transferFee: t.fee, status,
      completedAt: status === 'COMPLETED' ? new Date() : null,
      error: status === 'REVIEW' ? (t.status === 'succeeded'
        ? 'Transfer succeeded, but its fee differs from the deducted fee or is unavailable. Support must reconcile the difference; do not resend.'
        : 'PayMongo reported a failed transfer. Contact support for reconciliation.') : null } })
}

/** The client key is durable across retries. A lost response must never create a second checkout. */
export async function createFunding(companyId: string, userId: string, id: string, amount: number) {
  const existing = await prisma.walletFunding.findUnique({ where: { id } })
  if (existing) {
    if (existing.companyId !== companyId || existing.amountCentavos !== amount) throw new Error('Top-up request does not match.')
    return publicFunding(existing)
  }
  if (!fundingConfigured()) throw new Error('Automatic top-ups are awaiting platform configuration.')
  const forwardingFee = forwardingFeeCentavos()!
  if (forwardingFee >= amount) throw new Error('The top-up amount must exceed the forwarding fee.')
  const company = await readyWallet(companyId), parent = await parentWallet()
  if (sameAccount(parent.account, company.sourceAccount)) throw new Error('Company and main wallets must be different.')
  let row: WalletFunding
  try {
    row = await prisma.walletFunding.create({ data: {
      id, companyId, initiatedBy: userId, amountCentavos: amount,
      feePolicy: 'NET', transferFee: forwardingFee, parentAccountId: process.env.PAYMONGO_PARENT_ACCOUNT_ID!,
      accountId: company.saved.accountId!, walletId: company.wallet.id, livemode: providerMode(),
      sourceAccount: parent.account, destinationAccount: company.sourceAccount,
    } })
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e
    return createFunding(companyId, userId, id, amount)
  }
  try {
    // Parent credentials, deliberately without the child's Account-ID.
    const { data } = await provider<{ data: Checkout }>('POST', '/v1/checkout_sessions', {
      idempotencyKey: id, body: { data: { attributes: {
        payment_method_types: ['qrph'], reference_number: id,
        description: 'Company disbursement wallet top-up',
        line_items: [{ amount, quantity: 1, currency: 'PHP', name: 'Company wallet top-up' }],
        metadata: { companyId, fundingId: id },
        show_line_items: true, show_description: true, send_email_receipt: false,
      } } },
    })
    checkCheckout(row, data)
    row = await prisma.walletFunding.update({ where: { id }, data: {
      checkoutId: data.id, checkoutUrl: data.attributes.checkout_url, status: 'PAYMENT_PENDING',
    } })
  } catch {
    row = await prisma.walletFunding.update({ where: { id }, data: {
      status: 'REVIEW', error: 'Checkout creation could not be confirmed. Contact support with this top-up reference; do not repeat the payment.',
    } })
  }
  return publicFunding(row)
}

/** Bounded worker: one settlement page or one transfer per invocation. No local balance credits. */
async function advanceClaimedFunding(id: string) {
  let row = await prisma.walletFunding.findUniqueOrThrow({ where: { id } })
  context(row)
  if (['COMPLETED', 'EXPIRED', 'REVIEW'].includes(row.status)) return
  if (row.status === 'CREATING') {
    if (Date.now() - +row.createdAt > 120000) await prisma.walletFunding.updateMany({
      where: { id, status: 'CREATING', updatedAt: row.updatedAt },
      data: { status: 'REVIEW', error: 'Checkout response was interrupted. Contact support to reconcile this reference.' },
    })
    return
  }
  if (row.status === 'TRANSFERRING') {
    if (!row.batchId) return // Unknown outcome: never resend, even after the idempotency cache expires.
    const result = await provider<{ data: { id: string; transfers: Transfer[] } }>('GET', `/v2/batch_transfers/${row.batchId}`)
    await saveTransfer(row, result.data)
    return
  }
  if (!row.checkoutId) throw new Error('Missing checkout reference.')
  const checkout = (await provider<{ data: Checkout }>('GET', `/v1/checkout_sessions/${row.checkoutId}`)).data
  checkCheckout(row, checkout)
  const paid = (checkout.attributes.payments ?? []).filter(p => p.attributes.status === 'paid')
  if (!paid.length) {
    // Check payment first: a late payment must not be lost to local expiry.
    if (checkout.attributes.status === 'expired') await prisma.walletFunding.updateMany({
      where: { id, updatedAt: row.updatedAt }, data: { status: 'EXPIRED' },
    })
    return
  }
  const payment = paid[0], p = payment.attributes
  if (paid.length !== 1 || !/^pay_[a-zA-Z0-9]+$/.test(payment.id) ||
    (row.paymentId && row.paymentId !== payment.id) || p.amount !== row.amountCentavos ||
    p.currency !== 'PHP' || p.livemode !== row.livemode || p.disputed || p.refunds?.length) {
    await prisma.walletFunding.updateMany({ where: { id, updatedAt: row.updatedAt },
      data: { status: 'REVIEW', error: 'Payment amount, mode, refund or dispute requires reconciliation.' } })
    return
  }
  const payoutId = p.payout?.id ?? null
  if (payoutId && !/^po_[a-zA-Z0-9]+$/.test(payoutId)) throw new Error('Invalid settlement reference.')
  const updated = await prisma.walletFunding.updateMany({ where: { id, updatedAt: row.updatedAt }, data: {
    status: 'SETTLING', paymentId: payment.id, payoutId,
    ...(payoutId !== row.payoutId ? { payoutCursor: null } : {}),
  } })
  if (!updated.count) return
  row = await prisma.walletFunding.findUniqueOrThrow({ where: { id } })
  if (!payoutId) return // Paid does not mean funds reached the main wallet.
  const payout = (await provider<{ data: Payout }>('GET', `/v1/payouts/${payoutId}`)).data
  if (payout.attributes.status !== 'deposited') return
  const page = await provider<{ data: Settlement[]; pagination?: { next_cursor?: string | null } }>(
    'GET', `/v1/payouts/${payoutId}/transactions?limit=100${row.payoutCursor ? `&after=${encodeURIComponent(row.payoutCursor)}` : ''}`)
  const transaction = page.data.find(t => t.id === row.paymentId && t.type === 'payment')
  if (!transaction) {
    await prisma.walletFunding.updateMany({ where: { id, updatedAt: row.updatedAt },
      data: { payoutCursor: page.pagination?.next_cursor ?? null } })
    return
  }
  const credit = checkSettlement(row, payout, transaction)
  // Re-check KYB and pinned destination immediately before money movement.
  const company = await readyWallet(row.companyId), parent = await parentWallet()
  if (company.saved.accountId !== row.accountId || company.wallet.id !== row.walletId ||
    !sameAccount(company.sourceAccount, row.destinationAccount as Account) ||
    !sameAccount(parent.account, row.sourceAccount as Account)) throw new Error('Wallet destination changed; support must reconcile the top-up.')
  if (parent.wallet.balance.available < credit + (row.transferFee ?? 0)) throw new Error('Waiting for sufficient main wallet funds, including transfer fees.')
  const payload = { transfers: [{ source_account: parent.account, destination_account: company.sourceAccount,
    amount: credit, currency: 'PHP', provider: 'paymongo', reference_number: row.id,
    purpose: 'Disbursement', description: 'Company wallet top-up' }] }
  // Claim BEFORE POST. Concurrent workers cannot send a second transfer.
  const sending = await prisma.walletFunding.updateMany({ where: { id, status: 'SETTLING', updatedAt: row.updatedAt },
    data: { status: 'TRANSFERRING', netCentavos: transaction.attributes.net_amount, creditCentavos: credit,
      payload, error: null } })
  if (!sending.count) return
  row = await prisma.walletFunding.findUniqueOrThrow({ where: { id } })
  try {
    const result = await provider<{ data: { id: string; transfers: Transfer[] } }>('POST', '/v2/batch_transfers',
      { idempotencyKey: `fund${id}`, body: payload })
    await saveTransfer(row, result.data)
  } catch {
    await prisma.walletFunding.updateMany({ where: { id, status: 'TRANSFERRING', updatedAt: row.updatedAt },
      data: { error: 'Transfer outcome is unconfirmed. Support must reconcile it before any further action.' } })
  }
}

export async function advanceFunding(id: string) {
  const now = new Date(), lease = new Date(+now + 300000)
  const claimed = await prisma.walletFunding.updateMany({
    where: { id, OR: [{ processingUntil: null }, { processingUntil: { lt: now } }] },
    data: { processingUntil: lease, checkedAt: now },
  })
  if (!claimed.count) return
  try { await advanceClaimedFunding(id) }
  finally {
    await prisma.walletFunding.updateMany({ where: { id, processingUntil: lease },
      data: { processingUntil: null } })
  }
}

/** Recovery uses provider reads only; a typed reference never authorizes a new transfer. */
export async function reconcileFunding(companyId: string, id: string, reference: string) {
  const row = await prisma.walletFunding.findFirstOrThrow({ where: { id, companyId } })
  context(row)
  if (row.processingUntil && row.processingUntil > new Date()) throw new Error('This top-up is being checked. Please try again shortly.')
  if (reference.startsWith('cs_') && row.status === 'REVIEW' && !row.checkoutId && !row.payload) {
    const { data } = await provider<{ data: Checkout }>('GET', `/v1/checkout_sessions/${reference}`)
    if (data.id !== reference) throw new Error('Provider checkout reference mismatch.')
    checkCheckout(row, data)
    await prisma.walletFunding.updateMany({ where: { id, updatedAt: row.updatedAt }, data: {
      checkoutId: data.id, checkoutUrl: data.attributes.checkout_url, status: 'PAYMENT_PENDING', error: null,
    } })
  } else if (reference.startsWith('btr_') && row.payload && ['TRANSFERRING', 'REVIEW'].includes(row.status)) {
    const { data } = await provider<{ data: { id: string; transfers: Transfer[] } }>('GET', `/v2/batch_transfers/${reference}`)
    if (data.id !== reference) throw new Error('Provider batch reference mismatch.')
    await saveTransfer(row, data)
  } else throw new Error('This top-up cannot be reconciled with that reference.')
}
