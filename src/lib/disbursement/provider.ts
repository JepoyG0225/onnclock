export class ProviderError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export function providerMode() {
  const key = process.env.PAYMONGO_SECRET_KEY || ''
  if (!/^sk_(live|test)_/.test(key)) throw new Error('PayMongo secret key is not configured.')
  return key.startsWith('sk_live_')
}
export function onboardingConfigured() {
  return process.env.PAYMONGO_LINKED_WALLETS_ENABLED === 'true' &&
    !!process.env.PAYMONGO_PARENT_ACCOUNT_ID &&
    (process.env.PAYMONGO_KYB_ENCRYPTION_KEY?.length ?? 0) >= 32 &&
    /^sk_(live|test)_/.test(process.env.PAYMONGO_SECRET_KEY ?? '')
}
export async function provider<T>(method: 'GET' | 'POST' | 'PATCH', path: string, options: {
  accountId?: string; body?: unknown; idempotencyKey?: string
} = {}): Promise<T> {
  providerMode()
  if (options.accountId && !/^org_[a-zA-Z0-9]+$/.test(options.accountId)) throw new Error('Invalid linked account.')
  const multipart = options.body instanceof FormData
  const response = await fetch(`https://api.paymongo.com${path}`, {
    method, cache: 'no-store', signal: AbortSignal.timeout(25000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64')}`,
      Accept: 'application/json',
      ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
      ...(options.accountId ? { 'Account-ID': options.accountId } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: options.body === undefined ? undefined : multipart ? options.body as FormData : JSON.stringify(options.body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ProviderError(data?.errors?.[0]?.detail || `PayMongo request failed (${response.status}).`, response.status)
  if (!data) throw new Error('PayMongo returned an unreadable response. Reconciliation is required.')
  return data as T
}
export interface ProviderAccount {
  id: string
  activation_status: string
  person?: { identity_verification_status?: string }
  business?: { type?: string }
}
export interface ProviderWallet {
  id: string; merchant_id: string; livemode: boolean; is_default: boolean; status: string; type: string
  balance: { available: number; pending: number }
  source_account?: { number: string; name: string; bic: string }
  account?: { account_number: string; account_name: string; currency: string }
}
export interface KybRequest {
  id: string; account_id: string; status: string; product_code: string
  merchant_note?: { note?: string; requested_fields?: string[]; requested_files?: string[]; requested_custom_files?: string[] }
}
export function transferState(status: string) {
  return status === 'succeeded' ? 'COMPLETED' : status === 'failed' ? 'FAILED' : 'PROCESSING'
}
// PayMongo replaces punctuation in reference numbers with spaces.
export function sameTransferReference(actual: string | undefined, expected: string) {
  const normalized = expected.replace(/'/g, '').replace(/[^a-zA-Z0-9 ]/g, ' ')
  return actual === expected || actual === normalized
}
export function batchState(statuses: string[]) {
  if (!statuses.length || statuses.some(s => !['COMPLETED', 'FAILED'].includes(s))) return 'PROCESSING'
  return statuses.every(s => s === 'COMPLETED') ? 'COMPLETED' : statuses.every(s => s === 'FAILED') ? 'FAILED' : 'PARTIAL'
}
