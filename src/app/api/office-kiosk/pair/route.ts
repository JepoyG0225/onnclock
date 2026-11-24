import { faceBetaAvailable } from '@/lib/face/availability'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { KIOSK_COOKIE, hashKioskSecret, kioskSecret, kioskError, sameOrigin } from '@/lib/office-kiosk'

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return kioskError('Invalid origin.', 403)
  const body = await req.json().catch(() => null)
  const code = typeof body?.code === 'string' ? body.code.replace(/[\s-]/g, '').toUpperCase() : ''
  if (!/^[A-F0-9]{18}$/.test(code)) return kioskError('Enter the pairing code from Attendance Settings.')
  const pairHash = hashKioskSecret(code), now = new Date()
  const device = await prisma.officeKiosk.findFirst({ where: { pairHash, pairExpiresAt: { gt: now } }, select: { id: true, companyId: true } })
  if (!device || !(await faceBetaAvailable(device.companyId))) return kioskError('Pairing is available to Pro companies with face verification enabled.', 403)
  const token = kioskSecret()
  const updated = await prisma.officeKiosk.updateMany({ where: { id: device.id, companyId: device.companyId, pairHash, pairExpiresAt: { gt: now }, company: { faceRecognitionRequired: true } }, data: { tokenHash: hashKioskSecret(token), pairHash: null, pairExpiresAt: null, pairedAt: now, lastSeenAt: now } })
  if (updated.count !== 1) return kioskError('Pairing code expired, already used, or face verification is disabled.', 403)
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  response.cookies.set(KIOSK_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 365 })
  return response
}
