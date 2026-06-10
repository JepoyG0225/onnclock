import { prisma } from '@/lib/prisma'
import type { AuthContext } from '@/lib/api-auth'
import { headers } from 'next/headers'

export async function logAudit(
  ctx: AuthContext,
  action: string,
  entity: string,
  entityId: string,
  opts?: {
    oldValues?: Record<string, unknown>
    newValues?: Record<string, unknown>
    ipAddress?: string | null
  },
) {
  let ip = opts?.ipAddress ?? null
  if (!ip) {
    try {
      const h = await headers()
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
    } catch {
      // headers() unavailable outside request context
    }
  }

  return prisma.auditLog.create({
    data: {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action,
      entity,
      entityId,
      oldValues: opts?.oldValues ?? undefined,
      newValues: opts?.newValues ?? undefined,
      ipAddress: ip,
    },
  })
}
