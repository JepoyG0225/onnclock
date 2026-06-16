import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { CHAT_GROUP_MESSAGE_ENTITY, groupMessageEntityId, groupReadEntityId } from '@/lib/chat'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!ctx.companyId) return NextResponse.json({ groups: [] })

  try {
    const memberships = await prisma.chatGroupMember.findMany({
      where: { userId: ctx.userId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            companyId: true,
            createdAt: true,
            members: { select: { userId: true } },
          },
        },
      },
    })

    const myGroups = memberships
      .map(m => m.group)
      .filter(g => g.companyId === ctx.companyId)

    if (myGroups.length === 0) return NextResponse.json({ groups: [] })

    const groupIds = myGroups.map(g => g.id)
    const entityIds = groupIds.map(gid => groupMessageEntityId(gid))

    const [latestMessages, readMarkers] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          companyId: ctx.companyId,
          entity: CHAT_GROUP_MESSAGE_ENTITY,
          entityId: { in: entityIds },
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['entityId'],
        select: { entityId: true, createdAt: true, userId: true, newValues: true },
      }),
      prisma.auditLog.findMany({
        where: {
          companyId: ctx.companyId,
          entity: 'CHAT_GROUP_READ',
          entityId: { in: groupIds.map(gid => groupReadEntityId(gid, ctx.userId)) },
          userId: ctx.userId,
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['entityId'],
        select: { entityId: true, createdAt: true },
      }),
    ])

    const latestByGroup = new Map(latestMessages.map(m => [m.entityId, m]))
    const lastReadByGroup = new Map(readMarkers.map(r => [r.entityId, r.createdAt]))

    return NextResponse.json({
      groups: myGroups.map(g => {
        const entityId = groupMessageEntityId(g.id)
        const latest = latestByGroup.get(entityId)
        const payload = (latest?.newValues ?? null) as { body?: string } | null
        const readKey = groupReadEntityId(g.id, ctx.userId)
        const lastRead = lastReadByGroup.get(readKey)
        const hasUnread = !!latest && latest.userId !== ctx.userId && (!lastRead || latest.createdAt > lastRead)
        return {
          id: g.id,
          name: g.name,
          memberCount: g.members.length,
          memberUserIds: g.members.map(m => m.userId),
          lastMessage: payload?.body ?? null,
          lastMessageAt: latest?.createdAt ?? null,
          lastMessageByMe: latest?.userId === ctx.userId,
          unreadCount: hasUnread ? 1 : 0,
        }
      }),
    })
  } catch (err) {
    console.error('chat groups failed', err)
    return NextResponse.json({ groups: [], degraded: true })
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!ctx.companyId) return NextResponse.json({ error: 'No company' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const name = String(body?.name ?? '').trim().slice(0, 100)
  const memberIds: string[] = Array.isArray(body?.memberIds) ? body.memberIds : []

  if (!name) return NextResponse.json({ error: 'Group name is required' }, { status: 400 })
  if (memberIds.length < 1) return NextResponse.json({ error: 'Add at least 1 member' }, { status: 400 })

  // Validate members are in the same company
  const validMembers = await prisma.userCompany.findMany({
    where: { companyId: ctx.companyId, userId: { in: memberIds }, isActive: true },
    select: { userId: true },
  })
  const validIds = new Set(validMembers.map(m => m.userId))
  const allMembers = [...new Set([ctx.userId, ...memberIds.filter(id => validIds.has(id))])]

  const group = await prisma.chatGroup.create({
    data: {
      companyId: ctx.companyId,
      name,
      createdBy: ctx.userId,
      members: {
        create: allMembers.map(userId => ({ userId })),
      },
    },
    include: { members: { select: { userId: true } } },
  })

  // Broadcast new group to members
  const broadcaster = (globalThis as { __wsBroadcast?: (payload: unknown) => void }).__wsBroadcast
  broadcaster?.({
    type: 'chat_group_created',
    companyId: ctx.companyId,
    group: { id: group.id, name: group.name },
    memberUserIds: group.members.map(m => m.userId),
  })

  return NextResponse.json({
    ok: true,
    group: {
      id: group.id,
      name: group.name,
      memberCount: group.members.length,
      memberUserIds: group.members.map(m => m.userId),
      lastMessage: null,
      lastMessageAt: null,
      lastMessageByMe: false,
      unreadCount: 0,
    },
  })
}
