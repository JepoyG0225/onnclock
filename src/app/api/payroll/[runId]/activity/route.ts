import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  // Verify the run belongs to this company
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const logs = await prisma.auditLog.findMany({
    where: {
      companyId: ctx.companyId,
      entity: 'PayrollRun',
      entityId: runId,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Resolve user names for display
  const userIds = [...new Set(logs.map(l => l.userId))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  })
  const userMap = new Map(users.map(u => [u.id, u.name || u.email || 'Unknown']))

  const entries = logs.map(log => ({
    id: log.id,
    action: log.action,
    userName: userMap.get(log.userId) ?? 'Unknown',
    description: (log.newValues as Record<string, unknown> | null)?.description ?? null,
    oldValues: log.oldValues,
    newValues: log.newValues,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
  }))

  return NextResponse.json({ entries })
}
