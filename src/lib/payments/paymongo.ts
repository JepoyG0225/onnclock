/**
 * PayMongo QR Ph (QR Code) payment helper.
 * Docs: https://developers.paymongo.com/docs/qr-ph-api
 *
 * Auth: HTTP Basic — secret key as username, empty password.
 * Amounts: always in centavos (PHP × 100).
 * QR codes expire 30 minutes after creation.
 */

const PM_BASE    = 'https://api.paymongo.com/v1'
const PM_BASE_V2 = 'https://api.paymongo.com/v2'

function secretKey(): string {
  return process.env.PAYMONGO_SECRET_KEY ?? ''
}

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${secretKey()}:`).toString('base64')
}

async function pmFetch<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  baseUrl = PM_BASE,
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Disable Next.js caching for all PayMongo calls
    cache: 'no-store',
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = (json as Record<string, unknown>)?.errors
    const first = Array.isArray(err) ? (err[0] as Record<string, unknown>) : null
    throw new Error(
      (first?.detail as string) ||
        (first?.message as string) ||
        `PayMongo ${method} ${path} → ${res.status}`,
    )
  }

  return json as T
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface PmPaymentIntentAttrs {
  status: string
  client_key: string
  amount: number
  currency: string
  next_action?: {
    type?: string
    // Actual PayMongo QR Ph response path: next_action.code.image_url
    code?: { id?: string; image_url?: string; amount?: number; label?: string; test_url?: string }
    // Legacy / alternative paths kept as fallback
    qr_code_url?: { image?: string }
    consume_qr?: { image?: string }
    image?: string
  }
}

interface PmPaymentIntentData {
  id: string
  attributes: PmPaymentIntentAttrs
}

interface PmResponse<T> {
  data: T
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export type QrPhPaymentResult = {
  paymentIntentId: string
  clientKey: string
  qrImage: string   // data:image/png;base64,...
  status: string
  amountCentavos: number
}

/**
 * Full 3-step QR Ph flow:
 *   1. Create payment intent
 *   2. Create QR Ph payment method
 *   3. Attach → receive QR image
 */
export async function createQrPhPayment({
  amountPeso,
  description,
  billingName,
  billingEmail,
  metadata = {},
}: {
  amountPeso: number
  description: string
  billingName: string
  billingEmail: string
  metadata?: Record<string, string>
}): Promise<QrPhPaymentResult> {
  const amountCentavos = Math.round(amountPeso * 100)

  // 1 — Payment Intent
  const intentRes = await pmFetch<PmResponse<PmPaymentIntentData>>(
    'POST',
    '/payment_intents',
    {
      data: {
        attributes: {
          amount: amountCentavos,
          payment_method_allowed: ['qrph'],
          currency: 'PHP',
          capture_type: 'automatic',
          description,
          metadata,
        },
      },
    },
  )
  const { id: paymentIntentId, attributes: intentAttrs } = intentRes.data
  const clientKey = intentAttrs.client_key

  // 2 — Payment Method (QR Ph type)
  const methodRes = await pmFetch<PmResponse<{ id: string }>>(
    'POST',
    '/payment_methods',
    {
      data: {
        attributes: {
          type: 'qrph',
          billing: {
            name: billingName || 'Company',
            email: billingEmail || 'billing@onclockph.com',
          },
        },
      },
    },
  )
  const paymentMethodId = methodRes.data.id

  // 3 — Attach → get QR image
  const attachRes = await pmFetch<PmResponse<PmPaymentIntentData>>(
    'POST',
    `/payment_intents/${paymentIntentId}/attach`,
    {
      data: {
        attributes: {
          payment_method: paymentMethodId,
          client_key: clientKey,
        },
      },
    },
  )
  const attachAttrs = attachRes.data.attributes

  // Extract the base64 QR image from the actual response path
  const na = attachAttrs.next_action
  const qrImage: string =
    na?.code?.image_url ??
    na?.qr_code_url?.image ??
    na?.consume_qr?.image ??
    na?.image ??
    ''

  return {
    paymentIntentId,
    clientKey,
    qrImage,
    status: attachAttrs.status,
    amountCentavos,
  }
}

/**
 * Retrieve current status of a payment intent.
 * Statuses: awaiting_payment_method | awaiting_next_action | succeeded | failed
 */
export async function getPaymentIntentStatus(
  paymentIntentId: string,
): Promise<{ status: string; paymentIntentId: string }> {
  const res = await pmFetch<PmResponse<PmPaymentIntentData>>(
    'GET',
    `/payment_intents/${paymentIntentId}`,
  )
  return {
    paymentIntentId,
    status: res.data.attributes.status,
  }
}

// ─── Disbursement / Batch Transfers (v2) ─────────────────────────────────────

export interface BatchTransferItem {
  destinationAccount: { number: string; name: string; bic: string }
  amountCentavos: number
  /** 'instapay' for ≤ PHP 50,000 | 'pesonet' for > PHP 50,000 */
  provider: 'instapay' | 'pesonet' | 'paymongo'
  referenceNumber?: string
  purpose?: string
  description?: string
}

export interface BatchTransferResult {
  id: string
  status: string
  transfers: Array<{
    id?: string
    status: string
    amount: number
    provider: string
    referenceNumber?: string
    providerReferenceNumber?: string
    error?: string
  }>
}

/**
 * Retrieve a single PayMongo v2 transfer by its individual transfer ID
 * (the `id` field of one transfer inside a batch_transfer).
 */
export interface SingleTransferResult {
  id: string
  status: string
  amount: number
  provider: string
  referenceNumber?: string
  providerReferenceNumber?: string
  error?: string
}

export async function getSingleTransfer(transferId: string): Promise<SingleTransferResult> {
  const res = await pmFetch<Record<string, unknown>>('GET', `/transfers/${transferId}`, undefined, PM_BASE_V2)
  return {
    id: (res.id as string) ?? '',
    status: (res.status as string) ?? 'pending',
    amount: (res.amount as number) ?? 0,
    provider: (res.provider as string) ?? '',
    referenceNumber: res.reference_number as string | undefined,
    providerReferenceNumber: res.provider_reference_number as string | undefined,
    error: res.error as string | undefined,
  }
}

/**
 * Submit a single transfer (one employee disbursement) via PayMongo.
 * The source account is resolved from environment variables since OnClock
 * always disburses from the same operational account.
 *
 * Implemented on top of `createBatchTransfer` with a single-item array so
 * the request/response normalization stays in one place.
 */
export async function createSingleTransfer(
  item: Omit<BatchTransferItem, 'sourceAccount'>,
  _index?: number,
): Promise<{
  pmTransferId: string
  status: string
  amount: number
  provider: string
  referenceNumber?: string
  providerReferenceNumber?: string
  error?: string
}> {
  const sourceAccount = {
    number: process.env.PAYMONGO_SOURCE_ACCOUNT_NUMBER ?? '',
    name:   process.env.PAYMONGO_SOURCE_ACCOUNT_NAME   ?? '',
    bic:    process.env.PAYMONGO_SOURCE_ACCOUNT_BIC    ?? '',
  }
  const batch = await createBatchTransfer([{ ...item, sourceAccount }])
  const t = batch.transfers[0]
  if (!t) {
    return {
      pmTransferId: '',
      status: 'failed',
      amount: 0,
      provider: item.provider,
      error: 'PayMongo did not return a transfer record',
    }
  }
  return {
    pmTransferId: t.id ?? '',
    status: t.status,
    amount: t.amount,
    provider: t.provider,
    referenceNumber: t.referenceNumber,
    providerReferenceNumber: t.providerReferenceNumber,
    error: t.error,
  }
}
