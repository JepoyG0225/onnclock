import { requireAuth } from '@/lib/api-auth'
import { requireHrisProOrTrialApi } from '@/lib/hris-pro'

/** Plan entitlement supplements authentication; handlers retain role/tenant checks. */
export async function requireLearningAuth(...args: Parameters<typeof requireAuth>): ReturnType<typeof requireAuth> {
  const result = await requireAuth(...args)
  if (result.error) return result
  const error = await requireHrisProOrTrialApi(result.ctx.companyId)
  return error ? { ctx: null, error } : result
}
