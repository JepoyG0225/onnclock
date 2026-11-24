import { faceBetaAvailable } from '@/lib/face/availability'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { hashKioskSecret, kioskError, sameOrigin } from '@/lib/office-kiosk'

async function admin(write: boolean) {
  const auth = await requireAuth()
  if (auth.error) return auth
  if (!(await faceBetaAvailable(auth.ctx.companyId))) return { ctx: null, error: kioskError('Facial recognition is not available for this company.', 403) }
  if (!await ctxHasPermission(auth.ctx, write ? 'settings:write' : 'settings:read') || auth.ctx.role === 'DEPARTMENT_HEAD') return { ctx: null, error: kioskError('Company attendance settings permission required.', 403) }
  return auth
}
export async function GET() {
  const { ctx, error } = await admin(false)
  if (error) return error
  const device = await prisma.officeKiosk.findUnique({ where: { companyId: ctx!.companyId }, select: { id: true, name: true, pairedAt: true, lastSeenAt: true, tokenHash: true, pairExpiresAt: true } })
  return NextResponse.json({ device: device ? { id: device.id, name: device.name, pairedAt: device.pairedAt, lastSeenAt: device.lastSeenAt, active: !!device.tokenHash, pairExpiresAt: device.pairExpiresAt } : null }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(req: NextRequest) {
  const { ctx, error } = await admin(true)
  if (error) return error
  if (!sameOrigin(req)) return kioskError('Invalid origin.', 403)
  const company = await prisma.company.findUnique({ where: { id: ctx!.companyId }, select: { faceRecognitionRequired: true } })
  if (!company?.faceRecognitionRequired) return kioskError('Enable and save face verification first.', 403)
  const code = randomBytes(9).toString('hex').toUpperCase()
  const expiresAt = new Date(Date.now() + 15 * 60000)
  const data = { name: 'Office Android kiosk', pairHash: hashKioskSecret(code), pairExpiresAt: expiresAt, tokenHash: null, pairedAt: null, busyUntil: null }
  await prisma.officeKiosk.upsert({ where: { companyId: ctx!.companyId }, create: { ...data, companyId: ctx!.companyId }, update: data })
  return NextResponse.json({ code, expiresAt }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function DELETE(req: NextRequest) {
  const { ctx, error } = await admin(true)
  if (error) return error
  if (!sameOrigin(req)) return kioskError('Invalid origin.', 403)
  await prisma.officeKiosk.updateMany({ where: { companyId: ctx!.companyId }, data: { tokenHash: null, pairHash: null, pairExpiresAt: null } })
  return NextResponse.json({ ok: true })
}
