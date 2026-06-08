import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasScreenCaptureFeature, isDesktopApp } from '@/lib/feature-gates'

function isMobileUserAgent(ua: string): boolean {
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  // Auto-clockout columns are read alongside screen-capture so the desktop
  // app picks them up in its periodic security poll without a second
  // round-trip. The desktop client treats minutes ≤ 0 as disabled even if
  // the enabled flag is true, matching the schema comment.
  const [company, sub] = await Promise.all([
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: {
        screenCaptureEnabled: true,
        screenCaptureFrequencyMinutes: true,
        autoClockoutEnabled: true,
        autoClockoutMinutes: true,
      },
    }),
    getCompanySubscription(ctx.companyId),
  ])

  const entitled = hasScreenCaptureFeature(sub.pricePerSeat, sub.isTrial)
  const enabled  = entitled && (company?.screenCaptureEnabled ?? false)
  const ua       = req.headers.get('user-agent') ?? ''

  return NextResponse.json({
    feature: {
      entitled,
      enabled,
      frequencyMinutes: company?.screenCaptureFrequencyMinutes ?? 5,
      // Desktop-only: browser clock-in is blocked when enabled
      desktopOnlyRequired: enabled,
      browserClockBlocked: enabled,
      isMobileDevice: isMobileUserAgent(ua),
      isDesktopApp: isDesktopApp(ua),
    },
    autoClockout: {
      enabled: Boolean(company?.autoClockoutEnabled),
      minutes: Math.max(0, Number(company?.autoClockoutMinutes ?? 10)),
    },
  })
}
