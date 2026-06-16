import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { CHAT_PRESENCE_ENTITY } from '@/lib/chat'

export async function POST() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!ctx.companyId) return NextResponse.json({ ok: true })

  try {
    await prisma.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        action: 'PING',
        entity: CHAT_PRESENCE_ENTITY,
        entityId: ctx.userId,
        newValues: { role: ctx.role },
      },
    })

    const broadcaster = (globalThis as { __wsBroadcast?: (payload: unknown) => void }).__wsBroadcast
    broadcaster?.({
      type: 'chat_presence',
      companyId: ctx.companyId,
      userId: ctx.userId,
      online: true,
      role: ctx.role,
      at: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('chat presence failed', err)
    return NextResponse.json({ ok: true, degraded: true })
  }
}
