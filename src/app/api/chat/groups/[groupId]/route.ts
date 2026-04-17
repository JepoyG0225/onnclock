import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import {
  CHAT_GROUP_MESSAGE_ENTITY,
  groupMessageEntityId,
  groupReadEntityId,
  safeMessageBody,
} from '@/lib/chat'

async function isMember(groupId: string, userId: string, companyId: string) {
  const member = await prisma.chatGroupMember.findFirst({
    where: { groupId, userId, group: { companyId } },
  })
  return !!member
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!ctx.companyId) return NextResponse.json({ messages: [] })

  const { groupId } = await params
  const allowed = await isMember(groupId, ctx.userId, ctx.companyId)
  if (!allowed) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const entityId = groupMessageEntityId(groupId)
  const messages = await prisma.auditLog.findMany({
    where: { companyId: ctx.companyId, entity: CHAT_GROUP_MESSAGE_ENTITY, entityId },
    orderBy: { createdAt: 'asc' },
    take: 250,
    select: { id: true, userId: true, createdAt: true, newValues: true },
  })

  // Get sender names (both queries in parallel)
  const senderIds = [...new Set(messages.map(m => m.userId))]
  const [senderNames, empNames] = await Promise.all([
    prisma.userCompany.findMany({
      where: { companyId: ctx.companyId, userId: { in: senderIds } },
      include: { user: { select: { id: true, name: true, email: true } } },
    }).then(rows => new Map(rows.map(r => [r.userId, r.user.name || r.user.email]))),
    prisma.employee.findMany({
      where: { companyId: ctx.companyId, userId: { in: senderIds } },
      select: { userId: true, firstName: true, lastName: true },
    }).then(rows => new Map(rows.map(e => [e.userId!, `${e.firstName} ${e.lastName}`.trim()]))),
  ])

  return NextResponse.json({
    messages: messages.map(m => {
      const payload = (m.newValues ?? {}) as { body?: string }
      const name = empNames.get(m.userId) || senderNames.get(m.userId) || m.userId
      return {
        id: m.id,
        senderUserId: m.userId,
        senderName: name,
        body: payload.body ?? '',
        createdAt: m.createdAt,
      }
    }),
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!ctx.companyId) return NextResponse.json({ error: 'No company' }, { status: 403 })

  const { groupId } = await params
  const allowed = await isMember(groupId, ctx.userId, ctx.companyId)
  if (!allowed) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const text = safeMessageBody(body?.message)
  if (!text) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

  const entityId = groupMessageEntityId(groupId)
  const message = await prisma.auditLog.create({
    data: {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: 'SEND',
      entity: CHAT_GROUP_MESSAGE_ENTITY,
      entityId,
      newValues: { body: text, groupId },
    },
    select: { id: true, createdAt: true },
  })

  const broadcaster = (globalThis as { __wsBroadcast?: (payload: unknown) => void }).__wsBroadcast
  broadcaster?.({
    type: 'chat_group_message',
    companyId: ctx.companyId,
    groupId,
    message: {
      id: message.id,
      senderUserId: ctx.userId,
      body: text,
      createdAt: message.createdAt,
    },
  })

  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      senderUserId: ctx.userId,
      senderName: null,
      body: text,
      createdAt: message.createdAt,
    },
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!ctx.companyId) return NextResponse.json({ error: 'No company' }, { status: 403 })

  const { groupId } = await params
  const allowed = await isMember(groupId, ctx.userId, ctx.companyId)
  if (!allowed) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const newMemberIds: string[] = Array.isArray(body?.memberIds) ? body.memberIds : []
  if (newMemberIds.length === 0) return NextResponse.json({ error: 'No members to add' }, { status: 400 })

  // Validate they are active company members
  const valid = await prisma.userCompany.findMany({
    where: { companyId: ctx.companyId, userId: { in: newMemberIds }, isActive: true },
    select: { userId: true },
  })
  const validIds = valid.map(v => v.userId)

  // Upsert each member (skip if already in group)
  await Promise.all(
    validIds.map(userId =>
      prisma.chatGroupMember.upsert({
        where: { groupId_userId: { groupId, userId } },
        update: {},
        create: { groupId, userId },
      }).catch(() => null)
    )
  )

  const updated = await prisma.chatGroup.findUnique({
    where: { id: groupId },
    include: { members: { select: { userId: true } } },
  })

  return NextResponse.json({ ok: true, memberCount: updated?.members.length ?? 0, memberUserIds: updated?.members.map(m => m.userId) ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error
    if (!ctx.companyId) return NextResponse.json({ error: 'No company' }, { status: 403 })

    const { groupId } = await params
    const readKey = groupReadEntityId(groupId, ctx.userId)

    await prisma.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        action: 'READ',
        entity: 'CHAT_GROUP_READ',
        entityId: readKey,
        newValues: { groupId },
      },
    }).catch(() => null)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
