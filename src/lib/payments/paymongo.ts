/**
 * PayMongo QR Ph (QR Code) payment helper.
 * Docs: https://developers.paymongo.com/docs/qr-ph-api
 *
 * Auth: HTTP Basic — secret key as username, empty password.
 * Amounts: always in centavos (PHP × 100).
 * QR codes expire 30 minutes after creation.
 */

const PM_BASE = 'https://api.paymongo.com/v1'

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
): Promise<T> {
  const res = await fetch(`${PM_BASE}${path}`, {
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
