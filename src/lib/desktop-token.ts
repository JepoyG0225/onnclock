/**
 * Lightweight HMAC-signed tokens for the OnClock Desktop App.
 * No extra dependencies — uses Node's built-in crypto.
 *
 * Secret handling
 * ───────────────
 * Desktop tokens are signed with a DEDICATED secret (DESKTOP_TOKEN_SECRET)
 * so that rotating the web-session secret (NEXTAUTH_SECRET) does NOT log out
 * every desktop user. If DESKTOP_TOKEN_SECRET is unset we fall back to
 * NEXTAUTH_SECRET so tokens already issued under it keep verifying — this
 * change is fully backward compatible.
 *
 * Verification accepts the primary secret PLUS any secondary secrets, so a
 * future rotation can be done gracefully: point DESKTOP_TOKEN_SECRET at the
 * new value and put the old one in DESKTOP_TOKEN_SECRET_PREVIOUS — existing
 * tokens keep working until they age out instead of all breaking at once.
 */
import { createHmac, timingSafeEqual } from 'crypto'

// Secret used to SIGN new tokens.
const PRIMARY_SECRET =
  process.env.DESKTOP_TOKEN_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  'onclock-desktop-secret-fallback'

// Additional secrets accepted at VERIFY time only (for graceful rotation).
// NEXTAUTH_SECRET is always included so tokens minted before this module had
// a dedicated secret continue to verify even after DESKTOP_TOKEN_SECRET is set.
const VERIFY_SECRETS = Array.from(
  new Set(
    [
      PRIMARY_SECRET,
      process.env.DESKTOP_TOKEN_SECRET_PREVIOUS,
      process.env.NEXTAUTH_SECRET,
    ].filter((s): s is string => typeof s === 'string' && s.length > 0),
  ),
)

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

export interface DesktopTokenPayload {
  userId: string
  companyId: string
  role: string
  email: string
  exp: number
}

function signWith(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

export function createDesktopToken(payload: Omit<DesktopTokenPayload, 'exp'>): string {
  const full: DesktopTokenPayload = { ...payload, exp: Date.now() + TOKEN_TTL_MS }
  const data = Buffer.from(JSON.stringify(full)).toString('base64url')
  return `${data}.${signWith(PRIMARY_SECRET, data)}`
}

/**
 * Verify a desktop token.
 *
 * @param opts.graceMs  Allow tokens whose `exp` passed up to this many ms ago.
 *                      Used ONLY by the token-refresh endpoint so a user whose
 *                      token recently expired can renew without re-entering
 *                      their password. Normal API auth passes 0 (strict).
 */
export function verifyDesktopToken(
  token: string,
  opts?: { graceMs?: number },
): DesktopTokenPayload | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot < 0) return null
    const data = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const sigBuf = Buffer.from(sig)

    // Signature must match at least one accepted secret (timing-safe).
    const signatureValid = VERIFY_SECRETS.some(secret => {
      const expected = Buffer.from(signWith(secret, data))
      return sigBuf.length === expected.length && timingSafeEqual(sigBuf, expected)
    })
    if (!signatureValid) return null

    const payload: DesktopTokenPayload = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (!payload.exp) return null
    const grace = Math.max(0, opts?.graceMs ?? 0)
    if (Date.now() > payload.exp + grace) return null
    return payload
  } catch {
    return null
  }
}
