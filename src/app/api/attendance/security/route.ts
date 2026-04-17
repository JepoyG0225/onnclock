import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const SCREEN_CAPTURE_MIN_PLAN = 70

function isMobileUserAgent(ua: string): boolean {
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const [company, subscription] = await Promise.all([
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: {
        screenCaptureEnabled: true,
        screenCaptureFrequencyMinutes: true,
      },
    }),
    prisma.subscription.findUnique({
      where: { companyId: ctx.companyId },
      select: { pricePerSeat: true },
    }),
  ])

  const pricePerSeat = Number(subscription?.pricePerSeat ?? 0)
  const entitled = pricePerSeat >= SCREEN_CAPTURE_MIN_PLAN
  const enabled = entitled && (company?.screenCaptureEnabled ?? false)
  const ua = req.headers.get('user-agent') ?? ''

  return NextResponse.json({
    feature: {
      entitled,
      requiredPricePerSeat: SCREEN_CAPTURE_MIN_PLAN,
      currentPricePerSeat: pricePerSeat,
      enabled,
      frequencyMinutes: company?.screenCaptureFrequencyMinutes ?? 5,
      desktopOnlyRequired: enabled,
      isMobileDevice: isMobileUserAgent(ua),
    },
  })
}
