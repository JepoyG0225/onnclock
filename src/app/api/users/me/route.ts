import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  try {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, name: true, email: true, createdAt: true },
    })

    const company = ctx.companyId
      ? await prisma.company.findUnique({
          where: { id: ctx.companyId },
          select: { id: true, name: true, logoUrl: true },
        })
      : null

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    return NextResponse.json({
      user,
      company,
      role: ctx.role,
      actorRole: ctx.actorRole ?? ctx.role,
    })
  } catch (err) {
    console.error('[/api/users/me]', err)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Timed out fetching a new connection from the connection pool')) {
      // Degrade gracefully during transient DB pool exhaustion.
      return NextResponse.json({
        user: { id: ctx.userId, name: null, email: null, createdAt: null },
        company: null,
        role: ctx.role,
        actorRole: ctx.actorRole ?? ctx.role,
        degraded: true,
      })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
