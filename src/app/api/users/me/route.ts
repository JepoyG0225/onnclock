import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, name: true, email: true, createdAt: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { id: true, name: true, logoUrl: true },
  })

  return NextResponse.json({
    user,
    company,
    role: ctx.role,
    actorRole: ctx.actorRole ?? ctx.role,
  })
}
