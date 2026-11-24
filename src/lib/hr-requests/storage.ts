import { getSupabaseAdmin } from '@/lib/supabase/admin'
export { receiptMime as fileMime, RECEIPT_LIMIT as FILE_LIMIT } from '@/lib/expenses/storage'
export async function hrRequestStorage() {
 const admin=getSupabaseAdmin(),name='hr-request-files'
 let bucket=await admin.storage.getBucket(name)
 if(bucket.error){await admin.storage.createBucket(name,{public:false,fileSizeLimit:4*1024*1024,allowedMimeTypes:['application/pdf','image/jpeg','image/png','image/webp']});bucket=await admin.storage.getBucket(name)}
 if(bucket.error||bucket.data.public)throw new Error('Private document storage is unavailable.')
 return admin.storage.from(name)
}
