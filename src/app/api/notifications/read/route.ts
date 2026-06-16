/**
 * POST /api/notifications/read
 * Body: { ids?: string[] }  — when omitted, marks ALL the user's notifications read.
 *
 * Idempotent: rows already read remain read.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined

  try {
    const result = await prisma.notification.updateMany({
      where: {
        userId: ctx.userId,
        isRead: false,
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { isRead: true, readAt: new Date() },
    })
    return NextResponse.json({ updated: result.count })
  } catch (err) {
    console.error('[notifications] mark-read failed', err)
    return NextResponse.json({ updated: 0 })
  }
}
