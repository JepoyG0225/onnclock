/**
 * GET /api/notifications?limit=20&unreadOnly=1
 *
 * List in-app notifications for the current user. Newest first.
 * Always also returns `unreadCount` so the bell badge can render without a
 * second call.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const sp = req.nextUrl.searchParams
  const limit = Math.min(100, parseInt(sp.get('limit') ?? '20', 10) || 20)
  const unreadOnly = sp.get('unreadOnly') === '1'

  try {
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: ctx.userId, ...(unreadOnly ? { isRead: false } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({ where: { userId: ctx.userId, isRead: false } }),
    ])
    return NextResponse.json({ items, unreadCount })
  } catch (err) {
    // Table missing (older deploy) — degrade gracefully.
    console.error('[notifications] list failed', err)
    return NextResponse.json({ items: [], unreadCount: 0 })
  }
}
