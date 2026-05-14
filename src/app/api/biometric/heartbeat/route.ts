/**
 * POST /api/biometric/heartbeat — lightweight ping so the dashboard can show
 * each device as online/offline. Updates lastSeenAt + optional firmware /
 * IP info.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireDeviceAuth } from '@/lib/biometric-device-auth'

export const runtime = 'nodejs'

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || null
  return req.headers.get('x-real-ip') ?? null
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireDeviceAuth(req)
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const firmwareVersion = typeof body?.firmwareVersion === 'string' ? body.firmwareVersion : null

  const device = await prisma.biometricDevice.update({
    where: { id: ctx.deviceId },
    data: {
      lastSeenAt: new Date(),
      ipAddress:  clientIp(req),
      ...(firmwareVersion ? { firmwareVersion } : {}),
    },
    select: { id: true, name: true, status: true, lastSeenAt: true },
  })

  return NextResponse.json({ device })
}
