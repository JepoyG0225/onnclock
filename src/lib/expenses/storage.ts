import { getSupabaseAdmin } from '@/lib/supabase/admin'
export const RECEIPT_LIMIT = 4 * 1024 * 1024
export function receiptMime(bytes: Uint8Array) {
  if (bytes.length < 12) return null
  if (Buffer.from(bytes.subarray(0, 5)).toString() === '%PDF-') return 'application/pdf'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png'
  if (Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.subarray(8,12)).toString() === 'WEBP') return 'image/webp'
  return null
}
export async function receiptStorage() {
  const admin = getSupabaseAdmin()
  const name = 'expense-receipts'
  let bucket = await admin.storage.getBucket(name)
  if (bucket.error) {
    await admin.storage.createBucket(name, { public: false, fileSizeLimit: RECEIPT_LIMIT, allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] })
    bucket = await admin.storage.getBucket(name)
  }
  if (bucket.error || bucket.data.public) throw new Error('Private receipt storage is unavailable.')
  return admin.storage.from(name)
}
