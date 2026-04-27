import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { CHAT_MESSAGE_ENTITY, CHAT_GROUP_MESSAGE_ENTITY, conversationId, groupMessageEntityId, groupReadEntityId } from '@/lib/chat'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  try {
    let pendingDtr = 0
    let pendingLeaves = 0

    if (['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(ctx.role)) {
      const [dtr, leaves] = await Promise.all([
        prisma.dTRRecord.count({
          where: {
            employee: { companyId: ctx.companyId },
            timeOut: { not: null },
            approvedBy: null,
          },
        }),
        prisma.leaveRequest.count({
          where: {
            employee: { companyId: ctx.companyId },
            status: 'PENDING',
          },
        }),
      ])
      pendingDtr = dtr
      pendingLeaves = leaves
    }

    // Fetch contacts and group memberships in parallel — neither depends on the other
    const [contacts, memberships] = await Promise.all([
      prisma.userCompany.findMany({
        where: { companyId: ctx.companyId, isActive: true, userId: { not: ctx.userId } },
        select: { userId: true },
        take: 300,
      }),
      prisma.chatGroupMember.findMany({
        where: { userId: ctx.userId },
        select: { groupId: true },
      }),
    ])

    const convIds  = contacts.map(c => conversationId(ctx.companyId!, ctx.userId, c.userId))
    const groupIds = memberships.map(m => m.groupId)

    // Run all 4 read-marker queries in parallel
    const [readMarkers, totalDmMessages, groupReadMarkers, latestGroupMessages] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          companyId: ctx.companyId,
          entity: 'CHAT_READ',
          userId: ctx.userId,
          entityId: { in: convIds },
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['entityId'],
        select: { entityId: true, createdAt: true },
      }),
      prisma.auditLog.groupBy({
        by: ['entityId'],
        where: {
          companyId: ctx.companyId,
          entity: CHAT_MESSAGE_ENTITY,
          entityId: { in: convIds },
          userId: { not: ctx.userId },
        },
        _max: { createdAt: true },
      }),
      groupIds.length > 0
        ? prisma.auditLog.findMany({
            where: {
              companyId: ctx.companyId,
              entity: 'CHAT_GROUP_READ',
              userId: ctx.userId,
              entityId: { in: groupIds.map(gid => groupReadEntityId(gid, ctx.userId)) },
            },
            orderBy: { createdAt: 'desc' },
            distinct: ['entityId'],
            select: { entityId: true, createdAt: true },
          })
        : Promise.resolve([]),
      groupIds.length > 0
        ? prisma.auditLog.findMany({
            where: {
              companyId: ctx.companyId,
              entity: CHAT_GROUP_MESSAGE_ENTITY,
              entityId: { in: groupIds.map(gid => groupMessageEntityId(gid)) },
              userId: { not: ctx.userId },
            },
            orderBy: { createdAt: 'desc' },
            distinct: ['entityId'],
            select: { entityId: true, createdAt: true },
          })
        : Promise.resolve([]),
    ])

    const lastReadByConv = new Map(readMarkers.map(r => [r.entityId, r.createdAt]))
    const unreadDm = totalDmMessages.reduce((sum, row) => {
      const lastRead = lastReadByConv.get(row.entityId)
      const unread = !lastRead || (row._max.createdAt && row._max.createdAt > lastRead)
      return sum + (unread ? 1 : 0)
    }, 0)

    const lastReadByGroup = new Map(groupReadMarkers.map(r => [r.entityId, r.createdAt]))
    const unreadGroups = latestGroupMessages.reduce((sum, m) => {
      const groupId = m.entityId.replace(/^chat_group:/, '')
      const readKey = groupReadEntityId(groupId, ctx.userId)
      const lastRead = lastReadByGroup.get(readKey)
      const unread = !lastRead || m.createdAt > lastRead
      return sum + (unread ? 1 : 0)
    }, 0)

    return NextResponse.json({
      pendingDtr,
      pendingLeaves,
      unreadChat: unreadDm + unreadGroups,
    })
  } catch (err) {
    console.error('sidebar counts failed', err)
    return NextResponse.json({
      pendingDtr: 0,
      pendingLeaves: 0,
      unreadChat: 0,
      degraded: true,
    })
  }
}
