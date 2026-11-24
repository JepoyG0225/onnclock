import { getHrisProAccess } from '@/lib/hris-pro'

/** Facial recognition follows the same Pro and trial entitlement as other Pro features. */
export async function faceBetaAvailable(companyId?: string | null): Promise<boolean> {
  if (!companyId) return false
  return (await getHrisProAccess(companyId)).entitled
}
