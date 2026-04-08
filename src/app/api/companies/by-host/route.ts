import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function getSubdomain(host: string) {
  const h = host.split(':')[0]
  const parts = h.split('.')
  if (h.endsWith('localhost') && parts.length >= 2) return parts[0]
  if (parts.length >= 3) return parts[0]
  return null
}

export async function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const sub = getSubdomain(host)
  if (!sub) return NextResponse.json({ company: null })

  const company = await prisma.company.findFirst({
    where: { portalSubdomain: sub },
    select: { id: true, name: true, logoUrl: true, portalSubdomain: true },
  })

  return NextResponse.json({ company })
}
