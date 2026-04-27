/**
 * Lightweight HMAC-signed tokens for the OnClock Desktop App.
 * No extra dependencies — uses Node's built-in crypto.
 */
import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.NEXTAUTH_SECRET ?? 'onclock-desktop-secret-fallback'
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface DesktopTokenPayload {
  userId: string
  companyId: string
  role: string
  email: string
  exp: number
}

function sign(data: string): string {
  return createHmac('sha256', SECRET).update(data).digest('base64url')
}

export function createDesktopToken(payload: Omit<DesktopTokenPayload, 'exp'>): string {
  const full: DesktopTokenPayload = { ...payload, exp: Date.now() + TOKEN_TTL_MS }
  const data = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = sign(data)
  return `${data}.${sig}`
}

export function verifyDesktopToken(token: string): DesktopTokenPayload | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot < 0) return null
    const data = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expectedSig = sign(data)
    // Timing-safe compare
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload: DesktopTokenPayload = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (!payload.exp || Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
