import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'

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

  // resumeUrl is stored as a relative web path: /uploads/recruitment-resumes/…
  // Map it to an absolute filesystem path under /public
  const relPath = application.resumeUrl.startsWith('/')
    ? application.resumeUrl
    : `/${application.resumeUrl}`

  const absPath = path.join(process.cwd(), 'public', relPath)

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
