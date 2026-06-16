/**
 * Bearer-token authentication for biometric clock-in terminals (Pi devices).
 *
 *   1. Admin creates a pairing record on the HR dashboard → server returns
 *      a 6-digit `pairCode` (good for 15 minutes).
 *   2. Tech installs the device and enters the pairCode on the kiosk.
 *   3. Kiosk POSTs the pairCode to /api/biometric-devices/pair → server
 *      issues a long-lived bearer token (UUID-ish, 256 bits of entropy),
 *      stores only its SHA-256 hash, and clears pairCode.
 *   4. From then on, every kiosk request sets:
 *        Authorization: Bearer <token>
 *      The token is verified by hashing and looking up the row.
 *
 * Tokens never expire on their own — admins can revoke a device from the
 * UI which sets status = REVOKED and zeros tokenHash.
 */
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export interface DeviceContext {
  deviceId: string
  companyId: string
  deviceName: string
}

export function generatePairCode(): string {
  // 6-digit human-friendly code (000000-999999)
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export function generateDeviceToken(): string {
  // 32 random bytes → 43-char URL-safe base64
  return crypto.randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function requireDeviceAuth(
  req: NextRequest,
): Promise<{ ctx: DeviceContext; error: null } | { ctx: null; error: NextResponse }> {
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'Missing Bearer token' }, { status: 401 }),
    }
  }
  const token = authHeader.slice(7).trim()
  if (!token) {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'Empty Bearer token' }, { status: 401 }),
    }
  }

  const tokenHash = hashToken(token)
  const device = await prisma.biometricDevice.findFirst({
    where: { tokenHash, status: 'ACTIVE' },
    select: { id: true, companyId: true, name: true },
  })
  if (!device) {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'Invalid or revoked device token' }, { status: 401 }),
    }
  }

  // Touch lastSeenAt (best-effort, never block on failure)
  prisma.biometricDevice
    .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined)

  return {
    ctx: { deviceId: device.id, companyId: device.companyId, deviceName: device.name },
    error: null,
  }
}
