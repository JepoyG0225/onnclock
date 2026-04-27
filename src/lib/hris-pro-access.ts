import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { verifyImpersonateToken, IMPERSONATE_COOKIE } from '@/lib/impersonate'

/**
 * Server-side helper — returns true when the current session has HRIS PRO access.
 * SUPER_ADMIN always has access. TRIAL users have access. ACTIVE users need pricePerSeat >= 100.
 */
export async function getHrisProEnabled(): Promise<boolean> {
  const session = await auth()
  if (!session?.user) return false
  if (session.user.role === 'SUPER_ADMIN') return true

  let companyId = session.user.companyId
  // Respect active impersonation
  const jar = await cookies()
  const impToken = jar.get(IMPERSONATE_COOKIE)?.value
  if (impToken) {
    const imp = await verifyImpersonateToken(impToken)
    if (imp && imp.impersonatedBy === session.user.id) {
      companyId = imp.companyId
    }
  }

  if (!companyId) return false

  const sub = await prisma.subscription.findUnique({
    where: { companyId },
    select: { status: true, pricePerSeat: true },
  })
  if (!sub) return false

  const isTrial = sub.status === 'TRIAL'
  const pricePerSeat = Number(sub.pricePerSeat ?? 0)
  return isTrial || pricePerSeat >= 100
}
