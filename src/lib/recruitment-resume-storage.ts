import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { MAX_RESUME_BYTES, RESUME_TYPES, resumeFileType } from '@/lib/recruitment-upload'

const ticketSchema = z.object({
  companyId: z.string(), jobId: z.string(), email: z.string().email(),
  bucket: z.string(), path: z.string(), size: z.number().int().positive().max(MAX_RESUME_BYTES),
  mime: z.string(), expiresAt: z.number(),
})
function signature(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Résumé storage is not configured')
  return createHmac('sha256', secret).update(`recruitment-resume:${payload}`).digest()
}
export function verifyResumeTicket(token: string, job: { id: string; companyId: string }, email: string) {
  try {
    const [payload, signed, extra] = token.split('.')
    if (!payload || !signed || extra) throw new Error()
    const actual = Buffer.from(signed, 'base64url')
    const expected = signature(payload)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error()
    const ticket = ticketSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()))
    if (ticket.expiresAt < Date.now() || ticket.jobId !== job.id || ticket.companyId !== job.companyId || ticket.email !== email) throw new Error()
    return ticket
  } catch { throw new Error('The résumé upload has expired or is invalid. Please select the file again and retry.') }
}

export async function issueResumeUpload(job: { id: string; companyId: string }, email: string, file: { name: string; type: string; size: number }) {
  const { extension, mime } = resumeFileType(file)
  const admin = getSupabaseAdmin()
  const bucket = process.env.SUPABASE_RESUMES_BUCKET || 'recruitment-resumes'
  const existing = await admin.storage.getBucket(bucket)
  if (existing.error) {
    // A dedicated private bucket keeps applicant documents out of public asset storage.
    const created = await admin.storage.createBucket(bucket, { public: false, fileSizeLimit: MAX_RESUME_BYTES, allowedMimeTypes: Object.values(RESUME_TYPES) })
    if (created.error) {
      const retry = await admin.storage.getBucket(bucket) // another request may have created it
      if (retry.error || retry.data.public) throw new Error('Private résumé storage is unavailable')
    }
  } else if (existing.data.public) throw new Error('Résumé storage must be private')
  const objectPath = `${job.companyId}/${job.id}/${randomUUID()}.${extension}`
  const payload = Buffer.from(JSON.stringify({ companyId: job.companyId, jobId: job.id, email, bucket, path: objectPath, size: file.size, mime, expiresAt: Date.now() + 2 * 60 * 60 * 1000 })).toString('base64url')
  const receipt = `${payload}.${signature(payload).toString('base64url')}`
  const signed = await admin.storage.from(bucket).createSignedUploadUrl(objectPath, { upsert: false })
  if (signed.error) throw new Error('Unable to prepare résumé upload')
  return { signedUrl: signed.data.signedUrl, receipt, contentType: mime }
}

export async function resolveUploadedResume(token: string, job: { id: string; companyId: string }, email: string) {
  const ticket = verifyResumeTicket(token, job, email)
  const info = await getSupabaseAdmin().storage.from(ticket.bucket).info(ticket.path)
  if (info.error || !info.data) throw new Error('Résumé upload is incomplete. Please select the file again and retry.')
  const size = Number(info.data.size ?? info.data.metadata?.size)
  const contentType = info.data.contentType ?? info.data.metadata?.mimetype
  if (size !== ticket.size || contentType !== ticket.mime) {
    throw new Error('The uploaded résumé does not match the selected file. Please upload it again.')
  }
  return `supabase://${ticket.bucket}/${ticket.path}`
}
