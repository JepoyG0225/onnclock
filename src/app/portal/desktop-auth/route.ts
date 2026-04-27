/**
 * GET /portal/desktop-auth?t=<portalToken>&r=<path>
 *
 * Validates a short-lived exchange token issued by
 * POST /api/desktop-app/portal-token, mints a NextAuth v5 session
 * cookie, and redirects the Electron browser window to the target page.
 *
 * The Electron window already uses partition:'persist:portal' so the
 * cookie persists for subsequent portal window opens.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { encode } from 'next-auth/jwt'

const SECRET = process.env.NEXTAUTH_SECRET ?? 'onclock-dev-secret'

// Match auth.ts: use __Secure- prefix only when PORTAL_BASE_DOMAIN is set
const baseDomain = process.env.PORTAL_BASE_DOMAIN || ''
const COOKIE_NAME =
  process.env.NODE_ENV === 'production' && baseDomain
    ? '__Secure-next-auth.session-token'
    : 'authjs.session-token'

const IS_SECURE =
  process.env.NODE_ENV === 'production' && !!baseDomain

interface ExchangePayload {
  userId:    string
  companyId: string
  role:      string
  email:     string
  exp:       number
}

function verifyPortalToken(token: string): ExchangePayload | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot < 1) return null
    const data = token.slice(0, dot)
    const sig  = token.slice(dot + 1)

    const expected = createHmac('sha256', SECRET).update(data).digest('base64url')
    if (expected !== sig) return null

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as ExchangePayload
    if (!payload.exp || Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const t = searchParams.get('t') ?? ''
  const r = searchParams.get('r') ?? '/portal/clock'

  // Validate exchange token
  const payload = verifyPortalToken(t)
  if (!payload) {
    // Token missing or expired — send to portal login
    return NextResponse.redirect(new URL('/portal/login', req.url))
  }

  // Sanitise redirect target — must stay within /portal/*
  const redirectPath = /^\/portal\//.test(r) ? r : '/portal/clock'

  // Mint a NextAuth v5 encrypted session JWT (30-day session)
  const sessionToken = await encode({
    token: {
      sub:       payload.userId,
      id:        payload.userId,
      email:     payload.email,
      role:      payload.role,
      companyId: payload.companyId,
      name:      payload.email,  // fallback; will be overwritten by `session` callback
    },
    secret:  SECRET,
    salt:    COOKIE_NAME,         // NextAuth v5 uses salt = cookie name
    maxAge:  30 * 24 * 60 * 60,  // 30 days (same as default NextAuth session)
  })

  const response = NextResponse.redirect(new URL(redirectPath, req.url))

  const cookieDomain =
    process.env.NODE_ENV === 'production' && baseDomain ? `.${baseDomain}` : undefined

  response.cookies.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path:     '/',
    secure:   IS_SECURE,
    maxAge:   30 * 24 * 60 * 60,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  })

  return response
}
