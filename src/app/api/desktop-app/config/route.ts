/**
 * GET /api/desktop-app/config
 * Returns screen capture config for the authenticated desktop app user.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { screenCaptureEnabled: true, screenCaptureFrequencyMinutes: true, name: true },
  })

  const subscription = await prisma.subscription.findUnique({
    where: { companyId: ctx.companyId },
    select: { pricePerSeat: true },
  })

  const pricePerSeat = Number(subscription?.pricePerSeat ?? 0)
  const entitled = pricePerSeat >= 70

  return NextResponse.json({
    screenCapture: {
      entitled,
      enabled: entitled && (company?.screenCaptureEnabled ?? false),
      frequencyMinutes: company?.screenCaptureFrequencyMinutes ?? 5,
    },
    company: { name: company?.name ?? '' },
  })
}
