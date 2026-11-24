import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const MIME_MAP: Record<string, string> = {
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { applicationId } = await params

  const application = await prisma.jobApplication.findFirst({
    where: { id: applicationId, companyId: ctx.companyId },
    select: { resumeUrl: true },
  })

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  if (!application.resumeUrl) {
    return NextResponse.json({ error: 'No resume on file' }, { status: 404 })
  }

  if (application.resumeUrl.startsWith('supabase://')) {
    // Access was checked above. A short-lived storage URL supports files above
    // the function response limit without making the bucket public.
    const [bucket, ...parts] = application.resumeUrl.slice('supabase://'.length).split('/')
    const objectPath = parts.join('/')
    if (!bucket || parts[0] !== ctx.companyId || parts.some(p => !p || p === '.' || p === '..')) {
      return NextResponse.json({ error: 'Invalid résumé reference' }, { status: 404 })
    }
    try {
      const signed = await getSupabaseAdmin().storage.from(bucket).createSignedUrl(objectPath, 300)
      if (signed.error) throw signed.error
      return NextResponse.redirect(signed.data.signedUrl, { status: 307, headers: { 'Cache-Control': 'private, no-store' } })
    } catch {
      return NextResponse.json({ error: 'Résumé storage is temporarily unavailable.' }, { status: 503 })
    }
  }

  // resumeUrl is stored as a relative web path: /uploads/recruitment-resumes/…
  // Map it to an absolute filesystem path under /public
  const relPath = application.resumeUrl.startsWith('/')
    ? application.resumeUrl
    : `/${application.resumeUrl}`

  const absPath = path.join(process.cwd(), 'public', relPath)
  const legacyRoot = path.resolve(process.cwd(), 'public', 'uploads', 'recruitment-resumes') + path.sep
  if (!path.resolve(absPath).startsWith(legacyRoot)) {
    return NextResponse.json({ error: 'Invalid résumé reference' }, { status: 404 })
  }

  let buffer: Buffer
  try {
    buffer = await readFile(absPath)
  } catch {
    return NextResponse.json({ error: 'Resume file not found on server' }, { status: 404 })
  }

  const ext = absPath.split('.').pop()?.toLowerCase() ?? 'bin'
  const contentType = MIME_MAP[ext] ?? 'application/octet-stream'
  const fileName = path.basename(absPath)

  // For PDFs: inline so the browser renders it directly.
  // For Word docs: attachment so the browser downloads them.
  const disposition = contentType === 'application/pdf'
    ? `inline; filename="${fileName}"`
    : `attachment; filename="${fileName}"`

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Content-Length': String(buffer.length),
      // Allow same-origin iframes to embed this response
      'X-Frame-Options': 'SAMEORIGIN',
      // Cache for 5 min — file won't change, auth is already verified
      'Cache-Control': 'private, max-age=300',
    },
  })
}
