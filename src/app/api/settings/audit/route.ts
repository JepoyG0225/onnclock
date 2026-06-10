import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const LIMIT_MAX = 100

const EXCLUDED_ENTITIES = [
  'CHAT_READ',
  'CHAT_PRESENCE',
  'CHAT_MESSAGE',
  'CHAT_GROUP_MESSAGE',
  'CHAT_GROUP_READ',
  'CHAT_TYPING',
]

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'])
  if (error) return error

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') || 30), LIMIT_MAX)
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()

  const baseWhere = {
    companyId: ctx.companyId,
    entity: { notIn: EXCLUDED_ENTITIES },
  }

  const [logs, summary, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        userId: true,
        createdAt: true,
        oldValues: true,
        newValues: true,
        ipAddress: true,
      },
    }).then(async (rows) => {
      const userIds = [...new Set(rows.map(r => r.userId))]
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
      const userMap = new Map(users.map(u => [u.id, u]))
      return rows.map(r => ({
        ...r,
        userName: userMap.get(r.userId)?.name ?? null,
        userEmail: userMap.get(r.userId)?.email ?? null,
      }))
    }),
    prisma.auditLog.groupBy({
      by: ['entity'],
      where: baseWhere,
      _count: { _all: true },
      orderBy: { _count: { entity: 'desc' } },
      take: 6,
    }),
    prisma.auditLog.count({ where: baseWhere }),
  ])

  const filtered = q
    ? logs.filter(log =>
      `${log.action} ${log.entity} ${log.entityId}`.toLowerCase().includes(q))
    : logs

  return NextResponse.json({
    logs: filtered,
    totalCount,
    summary: summary.map(item => ({
      entity: item.entity,
      count: item._count._all,
    })),
  })
}
