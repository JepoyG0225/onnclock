import { notificationVisibility } from '@/lib/notifications-audience'
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
    const visible = await notificationVisibility(ctx)
    const rows = await prisma.notification.findMany({
      where: { companyId: ctx.companyId, userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
    })
    const checks = await Promise.all(rows.map(visible))
    const allowed = rows.filter((_, index) => checks[index])
    const unreadCount = allowed.filter(row => !row.isRead).length
    const items = allowed.filter(row => !unreadOnly || !row.isRead).slice(0, Math.max(1, limit))
    return NextResponse.json({ items, unreadCount }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    // Table missing (older deploy) — degrade gracefully.
    console.error('[notifications] list failed', err)
    return NextResponse.json({ items: [], unreadCount: 0 })
  }
}
