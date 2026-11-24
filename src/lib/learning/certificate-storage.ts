import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const CERTIFICATE_BUCKET = 'learning-certificates'
export async function certificateStorage() {
  const admin = getSupabaseAdmin()
  let bucket = await admin.storage.getBucket(CERTIFICATE_BUCKET)
  if (bucket.error) {
    await admin.storage.createBucket(CERTIFICATE_BUCKET, { public: false, fileSizeLimit: 4 * 1024 * 1024, allowedMimeTypes: ['image/png', 'image/jpeg'] })
    bucket = await admin.storage.getBucket(CERTIFICATE_BUCKET)
  }
  if (bucket.error || bucket.data.public) throw new Error('Private certificate storage is unavailable.')
  return admin.storage.from(CERTIFICATE_BUCKET)
}
