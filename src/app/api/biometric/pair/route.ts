/**
 * Device pairing endpoint — called once by the Pi kiosk during setup.
 *
 * POST /api/biometric/pair
 *   Body: { pairCode: "123456", serialNumber?: string, firmwareVersion?: string }
 *   Returns: { token: "...", device: {...} }
 *
 * The token returned here is the LONG-LIVED bearer the device persists to
 * /etc/onclock/device.json (or equivalent). Server only stores its
 * SHA-256 hash so the token cannot be recovered from the DB.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateDeviceToken, hashToken } from '@/lib/biometric-device-auth'
import { z } from 'zod'

export const runtime = 'nodejs'

const pairSchema = z.object({
  pairCode: z.string().regex(/^\d{6}$/, 'Expected a 6-digit code'),
  serialNumber: z.string().trim().max(120).optional().nullable(),
  firmwareVersion: z.string().trim().max(40).optional().nullable(),
})

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || null
  return req.headers.get('x-real-ip') ?? null
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = pairSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const device = await prisma.biometricDevice.findFirst({
    where: { pairCode: parsed.data.pairCode, status: 'PENDING_PAIRING' },
    select: { id: true, companyId: true, name: true, pairCodeExpiresAt: true, serialNumber: true },
  })
  if (!device) {
    return NextResponse.json({ error: 'Invalid or already-used pair code' }, { status: 404 })
  }
  if (device.pairCodeExpiresAt && device.pairCodeExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Pair code has expired — ask an admin to regenerate it' }, { status: 410 })
  }

  // If the device claims a serial that collides with a *different* device row,
  // refuse rather than silently swap.
  if (parsed.data.serialNumber) {
    const collision = await prisma.biometricDevice.findFirst({
      where: { serialNumber: parsed.data.serialNumber, NOT: { id: device.id } },
      select: { id: true },
    })
    if (collision) {
      return NextResponse.json({ error: 'This Pi serial is already paired to a different device' }, { status: 409 })
    }
  }

  const token = generateDeviceToken()
  const updated = await prisma.biometricDevice.update({
    where: { id: device.id },
    data: {
      tokenHash:          hashToken(token),
      pairCode:           null,
      pairCodeExpiresAt:  null,
      pairedAt:           new Date(),
      lastSeenAt:         new Date(),
      status:             'ACTIVE',
      serialNumber:       parsed.data.serialNumber ?? device.serialNumber,
      firmwareVersion:    parsed.data.firmwareVersion ?? null,
      ipAddress:          clientIp(req),
    },
    select: { id: true, companyId: true, name: true, location: true },
  })

  return NextResponse.json({
    token,
    device: updated,
  }, { status: 201 })
}
