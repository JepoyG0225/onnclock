import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { CHAT_MESSAGE_ENTITY, CHAT_GROUP_MESSAGE_ENTITY, conversationId, groupMessageEntityId, groupReadEntityId } from '@/lib/chat'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  try {
    let pendingDtr = 0
    let pendingLeaves = 0
    let pendingOvertime = 0
    let pendingTimeCorrections = 0
    let pendingBudgetRequisitions = 0
    let pendingCashAdvances = 0

    const permissions = await getEffectivePermissions(ctx.role, ctx.companyId, ctx.userId)
    const canReviewDtr = permissions.includes('dtr:read')
    const canReviewLeaves = permissions.includes('leaves:read')
    const canReviewOvertime = permissions.includes('overtime:approve')
    const canReviewTimeCorrections = permissions.includes('corrections:approve')
    const canReviewBudgetRequisitions = permissions.includes('budget:read')
    const canReviewCashAdvances = permissions.includes('cashadvance:approve')

    const [dtr, leaves, overtime, timeCorrections, budgetRequisitions, cashAdvances] = await Promise.all([
      canReviewDtr
        ? prisma.dTRRecord.count({
          where: {
            employee: { companyId: ctx.companyId },
            timeOut: { not: null },
            approvedBy: null,
          },
        })
        : Promise.resolve(0),
      canReviewLeaves
        ? prisma.leaveRequest.count({
          where: {
            employee: { companyId: ctx.companyId },
            status: 'PENDING',
          },
        })
        : Promise.resolve(0),
      canReviewOvertime
        ? prisma.overtimeRequest.count({
          where: {
            companyId: ctx.companyId,
            status: 'PENDING',
          },
        })
        : Promise.resolve(0),
      canReviewTimeCorrections
        ? prisma.timeEntryCorrection.count({
          where: {
            companyId: ctx.companyId,
            status: 'PENDING',
          },
        })
        : Promise.resolve(0),
      canReviewBudgetRequisitions
        ? prisma.budgetRequisition.count({
          where: {
            companyId: ctx.companyId,
            status: 'PENDING',
          },
        })
        : Promise.resolve(0),
      canReviewCashAdvances
        ? prisma.cashAdvanceRequest.count({
          where: {
            companyId: ctx.companyId,
            status: 'PENDING',
          },
        })
        : Promise.resolve(0),
    ])
    pendingDtr = dtr
    pendingLeaves = leaves
    pendingOvertime = overtime
    pendingTimeCorrections = timeCorrections
    pendingBudgetRequisitions = budgetRequisitions
    pendingCashAdvances = cashAdvances

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

    return NextResponse.json(
      {
        pendingDtr,
        pendingLeaves,
        pendingOvertime,
        pendingTimeCorrections,
        pendingBudgetRequisitions,
        pendingCashAdvances,
        unreadChat: unreadDm + unreadGroups,
      },
      {
        // Private SWR cache so quick navigations within ~30s reuse the
        // last value instead of triggering 8+ Prisma queries again. The
        // stale-while-revalidate window lets the browser show the cached
        // counts immediately while a fresh fetch is in flight.
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
        },
      },
    )
  } catch (err) {
    console.error('sidebar counts failed', err)
    return NextResponse.json({
      pendingDtr: 0,
      pendingLeaves: 0,
      pendingOvertime: 0,
      pendingTimeCorrections: 0,
      pendingBudgetRequisitions: 0,
      pendingCashAdvances: 0,
      unreadChat: 0,
      degraded: true,
    })
  }
}
