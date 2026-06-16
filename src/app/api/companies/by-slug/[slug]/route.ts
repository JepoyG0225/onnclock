import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!slug) return NextResponse.json({ company: null })

  const company = await prisma.company.findFirst({
    where: { portalSubdomain: slug.toLowerCase() },
    select: { id: true, name: true, logoUrl: true, portalSubdomain: true },
  })

  return NextResponse.json({ company })
}

