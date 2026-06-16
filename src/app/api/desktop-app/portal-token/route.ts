/**
 * POST /api/desktop-app/portal-token
 *
 * Exchanges a long-lived Desktop Bearer token for a short-lived (60 s)
 * single-use exchange token.  The Electron window opens
 * /portal/desktop-auth?t=<token>&r=<path> which validates this token,
 * mints a proper NextAuth session cookie, and redirects to the target page —
 * so the user never has to log in again in the portal sub-window.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyDesktopToken } from '@/lib/desktop-token'
import { createHmac } from 'crypto'

const SECRET = process.env.NEXTAUTH_SECRET ?? 'onclock-dev-secret'
const PORTAL_TOKEN_TTL_MS = 90 * 1000 // 90 seconds — enough time for the window to open

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyDesktopToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

  // Build a short-lived exchange token using the same HMAC scheme as desktop-token.ts
  const data = Buffer.from(
    JSON.stringify({
      userId:    payload.userId,
      companyId: payload.companyId,
      role:      payload.role,
      email:     payload.email,
      exp:       Date.now() + PORTAL_TOKEN_TTL_MS,
    })
  ).toString('base64url')

  const sig = createHmac('sha256', SECRET).update(data).digest('base64url')
  const portalToken = `${data}.${sig}`

  return NextResponse.json({ portalToken })
}
