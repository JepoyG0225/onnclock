import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { receiptMime } from '@/lib/expenses/storage'
export interface KybDocument { purpose: string; path: string; name: string; mime: string }
export async function kybStorage() {
  const storage = getSupabaseAdmin().storage
  let bucket = await storage.getBucket('company-kyb')
  if (bucket.error) {
    await storage.createBucket('company-kyb', { public: false, fileSizeLimit: 4 * 1024 * 1024, allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] })
    bucket = await storage.getBucket('company-kyb')
  }
  if (bucket.error || bucket.data.public) throw new Error('Private business document storage is unavailable.')
  return storage.from('company-kyb')
}
export function documentMime(bytes: Uint8Array) {
  const mime = receiptMime(bytes)
  return mime && ['application/pdf', 'image/jpeg', 'image/png'].includes(mime) ? mime : null
}
