import { NextRequest, NextResponse } from 'next/server'
import { kioskAuth, kioskError } from '@/lib/office-kiosk'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const device = await kioskAuth(req)
  if (!device) return kioskError('Device is not paired, has been revoked, or face verification is disabled.', 401)
  await prisma.officeKiosk.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
  return NextResponse.json({ company: device.company.name, logoUrl: device.company.logoUrl, name: device.name }, { headers: { 'Cache-Control': 'no-store' } })
}
