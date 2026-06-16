import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { CHAT_MESSAGE_ENTITY, CHAT_PRESENCE_ENTITY, conversationId } from '@/lib/chat'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!ctx.companyId) return NextResponse.json({ contacts: [] })

  try {
    // Everyone can chat with everyone in the same company (except themselves)
    const allUsers = await prisma.userCompany.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        userId: { not: ctx.userId },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      take: 300,
    })

    const userIds = allUsers.map(u => u.user.id)
    const cutoff = new Date(Date.now() - 90_000)
    const convIds = allUsers.map(u => conversationId(ctx.companyId, ctx.userId, u.user.id))

    // Run employee lookup and all audit-log queries in parallel
    const [employeeByUserId, presenceRows, latestMessages, readMarkers] = await Promise.all([
      prisma.employee.findMany({
        where: { companyId: ctx.companyId, isActive: true, userId: { in: userIds } },
        select: {
          userId: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          position: { select: { title: true } },
        },
      }).then(rows => new Map(rows.map(e => [e.userId, e]))),
      prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          companyId: ctx.companyId,
          entity: CHAT_PRESENCE_ENTITY,
          createdAt: { gte: cutoff },
          userId: { in: userIds },
        },
        _max: { createdAt: true },
      }),
      prisma.auditLog.findMany({
        where: {
          companyId: ctx.companyId,
          entity: CHAT_MESSAGE_ENTITY,
          entityId: { in: convIds },
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['entityId'],
        select: { entityId: true, createdAt: true, userId: true, newValues: true },
      }),
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
    ])

    const onlineUserIds = new Set(presenceRows.map(r => r.userId))
    const latestByConversation = new Map(latestMessages.map(m => [m.entityId, m]))
    const lastReadByConversation = new Map(readMarkers.map(r => [r.entityId, r.createdAt]))

    const contacts = allUsers.map(uc => {
      const emp = employeeByUserId.get(uc.user.id)
      const label = emp
        ? `${emp.firstName} ${emp.lastName}`.trim()
        : uc.user.name?.trim() || uc.user.email
      const subLabel = emp
        ? [emp.employeeNo, emp.position?.title].filter(Boolean).join(' - ') || uc.role.replace('_', ' ')
        : uc.role.replace('_', ' ')
      const convId = conversationId(ctx.companyId, ctx.userId, uc.user.id)
      const latest = latestByConversation.get(convId)
      const payload = (latest?.newValues ?? null) as { body?: string } | null
      const lastRead = lastReadByConversation.get(convId)
      const hasUnread = !!latest && latest.userId !== ctx.userId && (!lastRead || latest.createdAt > lastRead)
      return {
        userId: uc.user.id,
        label,
        subLabel,
        role: uc.role,
        online: onlineUserIds.has(uc.user.id),
        lastMessage: payload?.body ?? null,
        lastMessageAt: latest?.createdAt ?? null,
        lastMessageByMe: latest?.userId === ctx.userId,
        unreadCount: hasUnread ? 1 : 0,
      }
    }).sort((a, b) => a.label.localeCompare(b.label))

    return NextResponse.json({ contacts })
  } catch (err) {
    console.error('chat contacts failed', err)
    return NextResponse.json({ contacts: [], degraded: true })
  }
}
