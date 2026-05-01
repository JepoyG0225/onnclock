import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const LIMIT_MAX = 100

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'])
  if (error) return error

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') || 30), LIMIT_MAX)
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()

  const [logs, summary] = await Promise.all([
    prisma.auditLog.findMany({
      where: { companyId: ctx.companyId },
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
    }),
    prisma.auditLog.groupBy({
      by: ['entity'],
      where: { companyId: ctx.companyId },
      _count: { _all: true },
      orderBy: { _count: { entity: 'desc' } },
      take: 6,
    }),
  ])

  const filtered = q
    ? logs.filter(log =>
      `${log.action} ${log.entity} ${log.entityId}`.toLowerCase().includes(q))
    : logs

  return NextResponse.json({
    logs: filtered,
    summary: summary.map(item => ({
      entity: item.entity,
      count: item._count._all,
    })),
  })
}
