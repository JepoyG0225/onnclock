/**
 * POST /api/desktop-app/refresh
 *
 * Renews a Desktop App Bearer token WITHOUT requiring the password again.
 * The app should call this on a 401 (or proactively before expiry) with its
 * current token in the `Authorization: Bearer <token>` header.
 *
 * A grace window lets a token that expired recently still be renewed, so a
 * user returning after their 90-day token lapsed isn't forced to re-login —
 * as long as the account is still active and still a member of the company.
 * Beyond the grace window the app must fall back to /api/desktop-app/auth.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createDesktopToken, verifyDesktopToken } from '@/lib/desktop-token'
import { getCompanySubscription, hasScreenCaptureFeature } from '@/lib/feature-gates'

// Allow renewing a token that expired up to 30 days ago.
const REFRESH_GRACE_MS = 30 * 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  if (!token) {
    return NextResponse.json({ error: 'Missing token.' }, { status: 401 })
  }

  const payload = verifyDesktopToken(token, { graceMs: REFRESH_GRACE_MS })
  if (!payload) {
    return NextResponse.json(
      { error: 'Token cannot be refreshed. Please sign in again.', reauth: true },
      { status: 401 },
    )
  }

  // Re-validate the account against the current DB state — a token must not be
  // renewable once the user is deactivated or removed from the company.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      isActive: true,
      companies: {
        where: { isActive: true, companyId: payload.companyId },
        select: {
          companyId: true,
          role: true,
          company: { select: { name: true, screenCaptureEnabled: true, screenCaptureFrequencyMinutes: true } },
        },
      },
    },
  })

  if (!user || !user.isActive) {
    return NextResponse.json(
      { error: 'Account is no longer active. Please sign in again.', reauth: true },
      { status: 403 },
    )
  }

  const membership = user.companies[0]
  if (!membership) {
    return NextResponse.json(
      { error: 'No active company membership. Please sign in again.', reauth: true },
      { status: 403 },
    )
  }

  const { companyId, role, company } = membership
  const sub = await getCompanySubscription(companyId)
  const screenCaptureEntitled = hasScreenCaptureFeature(sub.pricePerSeat, sub.isTrial)

  const freshToken = createDesktopToken({
    userId: user.id,
    companyId,
    role,
    email: user.email,
  })

  return NextResponse.json({
    token: freshToken,
    user: {
      id: user.id,
      email: user.email,
      role,
      companyId,
      companyName: company.name,
    },
    screenCapture: {
      entitled: screenCaptureEntitled,
      enabled: screenCaptureEntitled && company.screenCaptureEnabled,
      frequencyMinutes: company.screenCaptureFrequencyMinutes,
    },
  })
}
