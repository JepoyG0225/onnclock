import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { CHAT_MESSAGE_ENTITY, CHAT_READ_ENTITY, conversationId, safeMessageBody } from '@/lib/chat'

async function canTalk(companyId: string, currentUserId: string, withUserId: string) {
  if (currentUserId === withUserId) return false
  // Single query instead of two parallel lookups to reduce pool pressure.
  const members = await prisma.userCompany.count({
    where: {
      companyId,
      isActive: true,
      userId: { in: [currentUserId, withUserId] },
    },
  })
  // Both must be active members of the same company.
  return members === 2
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!ctx.companyId) return NextResponse.json({ messages: [] })

  const withUserId = req.nextUrl.searchParams.get('withUserId')?.trim()
  if (!withUserId) return NextResponse.json({ error: 'withUserId is required' }, { status: 400 })

  const allowed = await canTalk(ctx.companyId, ctx.userId, withUserId)
  if (!allowed) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const convId = conversationId(ctx.companyId, ctx.userId, withUserId)
  const messages = await prisma.auditLog.findMany({
    where: { companyId: ctx.companyId, entity: CHAT_MESSAGE_ENTITY, entityId: convId },
    orderBy: { createdAt: 'asc' },
    take: 250,
    select: { id: true, userId: true, createdAt: true, newValues: true },
  })

  return NextResponse.json({
    conversationId: convId,
    messages: messages.map(m => {
      const payload = (m.newValues ?? {}) as { body?: string; toUserId?: string }
      return {
        id: m.id,
        senderUserId: m.userId,
        receiverUserId: payload.toUserId ?? null,
        body: payload.body ?? '',
        createdAt: m.createdAt,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!ctx.companyId) return NextResponse.json({ error: 'No company' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const withUserId = String(body?.withUserId ?? '').trim()
  const text = safeMessageBody(body?.message)

  if (!withUserId) return NextResponse.json({ error: 'withUserId is required' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

  const allowed = await canTalk(ctx.companyId, ctx.userId, withUserId)
  if (!allowed) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const convId = conversationId(ctx.companyId, ctx.userId, withUserId)
  const message = await prisma.auditLog.create({
    data: {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'SEND',
      entity: CHAT_MESSAGE_ENTITY,
      entityId: convId,
      newValues: { body: text, toUserId: withUserId },
    },
    select: { id: true, createdAt: true },
  })

  const broadcaster = (globalThis as { __wsBroadcast?: (payload: unknown) => void }).__wsBroadcast
  broadcaster?.({
    type: 'chat_message',
    companyId: ctx.companyId,
    conversationId: convId,
    toUserId: withUserId,
    message: {
      id: message.id,
      senderUserId: ctx.userId,
      receiverUserId: withUserId,
      body: text,
      createdAt: message.createdAt,
    },
  })

  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      senderUserId: ctx.userId,
      receiverUserId: withUserId,
      body: text,
      createdAt: message.createdAt,
    },
  })
}

export async function PATCH(req: NextRequest) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error
    if (!ctx.companyId) return NextResponse.json({ error: 'No company' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const withUserId = String(body?.withUserId ?? '').trim()
    if (!withUserId) return NextResponse.json({ error: 'withUserId is required' }, { status: 400 })

    const allowed = await canTalk(ctx.companyId, ctx.userId, withUserId)
    if (!allowed) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const convId = conversationId(ctx.companyId, ctx.userId, withUserId)
    await prisma.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        action: 'READ',
        entity: CHAT_READ_ENTITY,
        entityId: convId,
        newValues: { withUserId },
      },
    }).catch(err => console.error('chat read marker write failed', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('chat PATCH failed', err)
    return NextResponse.json({ ok: true, degraded: true })
  }
}
