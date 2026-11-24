import { requireAuth } from '@/lib/api-auth'
import { requireHrisProOrTrialApi } from '@/lib/hris-pro'
export async function requireBenefitsAuth() {
 const auth = await requireAuth()
 if (auth.error) return auth
 const error = await requireHrisProOrTrialApi(auth.ctx.companyId)
 if (error) return { ctx: null, error }
 return auth
}
