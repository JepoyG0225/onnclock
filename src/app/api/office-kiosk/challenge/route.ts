import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { kioskAuth, kioskError } from '@/lib/office-kiosk'

// Optional explicit action keeps in-flight older kiosk pages compatible.
const schema = z.object({ action: z.enum(['IN', 'OUT', 'AUTO']).default('AUTO') })
export async function POST(req: NextRequest) {
  const device = await kioskAuth(req)
  if (!device) return kioskError('Kiosk is not authorized. Ask your company admin to check pairing and face verification.', 401)
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) return kioskError('Could not start the face scan.')
  const now = new Date()
  const allowed = await prisma.officeKiosk.updateMany({ where: { id: device.id, OR: [{ lastChallengeAt: null }, { lastChallengeAt: { lt: new Date(Date.now() - 3000) } }] }, data: { lastChallengeAt: now } })
  if (!allowed.count) return kioskError('Wait a few seconds before scanning again.', 429)
  const challenge = await prisma.officeKioskAttempt.create({ data: { kioskId: device.id, action: body.data.action, expiresAt: new Date(Date.now() + 90000) } })
  return NextResponse.json({ challengeId: challenge.id, expiresAt: challenge.expiresAt }, { headers: { 'Cache-Control': 'no-store' } })
}
