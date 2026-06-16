import type { AuthContext } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function resolvePortalEmployeeId(ctx: AuthContext): Promise<string | null> {
  const byUserId = await prisma.employee.findFirst({
    where: { companyId: ctx.companyId, userId: ctx.userId, isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  if (byUserId?.id) return byUserId.id

  const email = ctx.email?.trim()
  if (!email) return null

  const byEmail = await prisma.employee.findFirst({
    where: {
      companyId: ctx.companyId,
      isActive: true,
      OR: [
        { workEmail: { equals: email, mode: 'insensitive' } },
        { personalEmail: { equals: email, mode: 'insensitive' } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  return byEmail?.id ?? null
}

