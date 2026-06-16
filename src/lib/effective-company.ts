import { cookies } from 'next/headers'
import { verifyImpersonateToken, IMPERSONATE_COOKIE } from '@/lib/impersonate'

type SessionUserLike = {
  id: string
  role?: string | null
  companyId?: string | null
}

export async function resolveEffectiveCompanyId(user: SessionUserLike): Promise<string | null> {
  let companyId = user.companyId ?? null

  if (user.role === 'SUPER_ADMIN') {
    const jar = await cookies()
    const impToken = jar.get(IMPERSONATE_COOKIE)?.value
    if (impToken) {
      const imp = await verifyImpersonateToken(impToken)
      if (imp && imp.impersonatedBy === user.id) {
        companyId = imp.companyId
      }
    }
  }

  return companyId
}
