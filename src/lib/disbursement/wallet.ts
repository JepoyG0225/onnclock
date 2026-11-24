import { prisma } from '@/lib/prisma'
import { provider, providerMode, onboardingConfigured, type ProviderAccount, type ProviderWallet, type KybRequest } from './provider'
import { walletBlockReason } from './kyb-policy'

export async function syncCompanyWallet(companyId: string) {
  const saved = await prisma.companyPaymongoWallet.findUnique({ where: { companyId } })
  if (!saved?.accountId) return { saved, wallet: null }
  if (saved.livemode !== providerMode()) throw new Error('This company wallet belongs to a different PayMongo mode.')
  const account = (await provider<{ data: ProviderAccount }>('GET', `/v2/accounts/${saved.accountId}`)).data
  if (account.id !== saved.accountId) throw new Error('PayMongo returned a different account.')
  let request: KybRequest | null = null
  if (saved.kybRequestId) {
    request = (await provider<{ data: KybRequest }>('GET', `/v1/requests/${saved.kybRequestId}`, { accountId: saved.accountId })).data
    if (request.account_id !== saved.accountId || request.id !== saved.kybRequestId || request.product_code !== 'prd_svc_paymongo_account_update') throw new Error('Business verification account mismatch.')
  }
  let wallet: ProviderWallet | null = null
  let walletError: string | null = null
  if (account.activation_status === 'activated') {
    try {
      const wallets = (await provider<{ data: ProviderWallet[] }>('GET', '/v2/wallets?fields=balance&fields=account&fields=limits', { accountId: saved.accountId })).data
      if (!Array.isArray(wallets)) throw new Error('PayMongo returned an invalid wallet list.')
      const candidates = wallets.filter(w => w.merchant_id === saved.accountId && w.livemode === saved.livemode)
      wallet = (saved.walletId ? candidates.find(w => w.id === saved.walletId) : candidates.find(w => w.is_default) ?? (candidates.length === 1 ? candidates[0] : null)) ?? null
    } catch {
      walletError = 'PayMongo wallet access could not be verified. Check the linked-account permissions and refresh.'
    }
  }
  const changed = await prisma.companyPaymongoWallet.updateMany({
    where: { companyId, updatedAt: saved.updatedAt },
    data: {
      activationStatus: account.activation_status,
      identityStatus: account.person?.identity_verification_status ?? 'pending',
      ...(request ? { kybStatus: request.status, reviewerNote: request.merchant_note ?? {} } : {}),
      walletId: wallet?.id ?? saved.walletId, walletStatus: wallet?.status ?? null, walletType: wallet?.type ?? null,
      lastSyncedAt: new Date(),
      ...(!saved.operation ? { lastError: walletError } : {}),
    },
  })
  if (!changed.count) throw new Error('Wallet verification changed during refresh. Please refresh again.')
  const updated = await prisma.companyPaymongoWallet.findUniqueOrThrow({ where: { companyId } })
  return { saved: updated, wallet }
}
export async function legacyBlock(companyId: string) {
  const [company, pending, processing] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { disbursementBalance: true } }),
    prisma.disbursementTopUp.count({ where: { companyId, status: { in: ['PENDING', 'PAID'] } } }),
    prisma.payrollDisbursement.count({ where: { companyId, pmAccountId: null, status: { in: ['PROCESSING', 'PARTIAL', 'FAILED'] } } }),
  ])
  return Number(company?.disbursementBalance ?? 0) !== 0 || pending > 0 || processing > 0
    ? 'Existing wallet credits, top-ups, or unresolved transfers must be reconciled before using the linked company wallet.'
    : null
}
export async function readyWallet(companyId: string) {
  if (!onboardingConfigured()) throw new Error('Company wallets are awaiting PayMongo platform configuration.')
  const { saved, wallet } = await syncCompanyWallet(companyId)
  if (!saved?.accountId) throw new Error('Set up the company wallet and complete business verification first.')
  const reason = walletBlockReason(saved)
  if (reason) throw new Error(reason)
  const legacy = await legacyBlock(companyId)
  if (legacy) throw new Error(legacy)
  if (!wallet || wallet.account?.currency !== 'PHP') throw new Error('A PHP company wallet is required.')
  if (!Number.isSafeInteger(wallet.balance?.available) || wallet.balance.available < 0) throw new Error('PayMongo available balance is unavailable.')
  const sourceAccount = wallet.source_account ?? {
    number: wallet.account.account_number, name: wallet.account.account_name,
    // Configure the BIC provisioned by PayMongo; never fall back to OnClock's source account.
    bic: process.env.PAYMONGO_WALLET_BIC ?? '',
  }
  if (!sourceAccount.number || !sourceAccount.name || !sourceAccount.bic) throw new Error('PayMongo wallet source details are not configured.')
  return { saved, wallet, sourceAccount }
}
