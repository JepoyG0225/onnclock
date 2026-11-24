import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { productRelease } from '@/lib/product-updates'

/** Atomic receipt prevents duplicate popups across tabs, browsers and devices. */
export async function POST() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (ctx.role === 'SUPER_ADMIN' || ctx.actorRole === 'SUPER_ADMIN') return NextResponse.json({ release: null })
  const permissions = await getEffectivePermissions(ctx.role, ctx.companyId, ctx.userId)
  const release = productRelease(ctx.role, permissions)
  if (!release || (!release.updates.length && !release.spotlight)) return NextResponse.json({ release: null })
  const result = await prisma.userUpdateReceipt.createMany({
    data: [{ userId: ctx.userId, releaseId: release.id }], skipDuplicates: true,
  })
  return NextResponse.json({ release: result.count === 1 ? release : null }, { headers: { 'Cache-Control': 'private, no-store' } })
}
