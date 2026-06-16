type MayaCheckoutItem = {
  name: string
  quantity: number
  totalAmount: {
    value: number
    currency: string
  }
}

type MayaCheckoutPayload = {
  totalAmount: { value: number; currency: string }
  buyer: {
    firstName: string
    lastName: string
    contact: { email: string }
  }
  items: MayaCheckoutItem[]
  requestReferenceNumber: string
  redirectUrl: {
    success: string
    failure: string
    cancel: string
  }
  metadata?: Record<string, string>
}

export async function createMayaCheckoutSession(payload: MayaCheckoutPayload) {
  const secretKey = process.env.PAYMAYA_SECRET_KEY?.trim()
  if (!secretKey) {
    throw new Error('PAYMAYA_SECRET_KEY is not configured')
  }

  const endpoint = process.env.PAYMAYA_CHECKOUT_URL?.trim() || 'https://pg-sandbox.paymaya.com/checkout/v1/checkouts'
  const authToken = Buffer.from(`${secretKey}:`).toString('base64')

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${authToken}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Failed to create Maya checkout session')
  }

  const checkoutUrl = String(data?.redirectUrl || data?.checkoutUrl || '').trim()
  if (!checkoutUrl) {
    throw new Error('Maya checkout response missing redirectUrl')
  }

  return {
    checkoutId: String(data?.checkoutId || data?.id || ''),
    checkoutUrl,
    raw: data,
  }
}
