import { createHmac, timingSafeEqual } from 'crypto'
export function verifySignature(raw: string, header: string, secret: string, live: boolean, now = Date.now()) {
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=')))
  const timestamp = Number(parts.t), supplied = parts[live ? 'li' : 'te'] ?? ''
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > 300 || !/^[a-f0-9]{64}$/i.test(supplied)) return false
  const expected = createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest()
  return timingSafeEqual(expected, Buffer.from(supplied, 'hex'))
}
