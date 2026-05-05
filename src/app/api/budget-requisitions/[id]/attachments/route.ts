import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const HR_ROLES = new Set(['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN'])

async function checkBudgetReqAccess(ctx: { role?: string | null; companyId?: string | null }): Promise<NextResponse | null> {
  if (HR_ROLES.has(ctx.role ?? '')) return null
  const sub = await getCompanySubscription(ctx.companyId ?? '')
  if (hasHrisProFeature(sub.pricePerSeat) || sub.isTrial) return null
  return NextResponse.json(
    { error: 'Budget Requisitions require a Pro or Trial subscription.', notEntitled: true },
    { status: 403 }
  )
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  }
  return map[mime] ?? 'bin'
}

function getStorageBucket() {
  return process.env.SUPABASE_ATTACHMENTS_BUCKET || process.env.SUPABASE_LOGO_BUCKET || 'company-logos'
}

/** Extract Supabase Storage object path from its public URL */
function objectPathFromUrl(publicUrl: string, bucket: string): string | null {
  try {
    const url = new URL(publicUrl)
    const marker = `/storage/v1/object/public/${bucket}/`
    const idx = url.pathname.indexOf(marker)
    if (idx === -1) return null
    return url.pathname.slice(idx + marker.length)
  } catch {
    return null
  }
}

/** GET  /api/budget-requisitions/[id]/attachments  — list */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const gate = await checkBudgetReqAccess(ctx)
  if (gate) return gate

  const { id } = await params

  const isHR = HR_ROLES.has(ctx.role ?? '')
  const employee = isHR ? null : await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })

  const req = await prisma.budgetRequisition.findFirst({
    where: {
      id,
      ...(isHR
        ? { companyId: ctx.companyId! }
        : { employeeId: employee?.id ?? '__none__' }
      ),
    },
    select: { id: true },
  })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const attachments = await prisma.budgetRequisitionAttachment.findMany({
    where: { requisitionId: id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ attachments })
}

/** POST /api/budget-requisitions/[id]/attachments  — upload */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const gate = await checkBudgetReqAccess(ctx)
  if (gate) return gate

  const { id } = await params

  const isHR = HR_ROLES.has(ctx.role ?? '')
  const employee = isHR ? null : await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })

  const req = await prisma.budgetRequisition.findFirst({
    where: {
      id,
      ...(isHR
        ? { companyId: ctx.companyId! }
        : { employeeId: employee?.id ?? '__none__', status: 'PENDING' }
      ),
    },
    select: { id: true, companyId: true },
  })
  if (!req) {
    return NextResponse.json({ error: 'Not found or not editable' }, { status: 404 })
  }

  // Parse form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type. Allowed: PDF, JPG, PNG, WEBP, DOC, DOCX, XLS, XLSX' }, { status: 400 })
  }
  const MAX_BYTES = 20 * 1024 * 1024 // 20 MB
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 20 MB limit' }, { status: 400 })
  }

  // Max 10 attachments per requisition
  const existingCount = await prisma.budgetRequisitionAttachment.count({
    where: { requisitionId: id },
  })
  if (existingCount >= 10) {
    return NextResponse.json({ error: 'Maximum 10 attachments per requisition' }, { status: 400 })
  }

  // Upload to Supabase Storage
  const ext = extFromMime(file.type)
  const objectPath = `budget-req/${req.companyId}/${id}/${Date.now()}-${randomUUID()}.${ext}`
  const bucket = getStorageBucket()

  const supabase = getSupabaseAdmin()
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, bytes, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('[budget-req attachments] Supabase upload error:', uploadError)
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(objectPath)
  const fileUrl = urlData.publicUrl

  try {
    const attachment = await prisma.budgetRequisitionAttachment.create({
      data: {
        requisitionId: id,
        fileName: file.name || `file.${ext}`,
        fileUrl,
        fileSize: file.size,
        mimeType: file.type,
        uploadedBy: ctx.userId,
      },
    })
    return NextResponse.json({ attachment }, { status: 201 })
  } catch (e) {
    // Clean up uploaded file if DB insert fails
    await supabase.storage.from(bucket).remove([objectPath]).catch(() => {})
    return NextResponse.json({ error: 'Failed to save attachment record' }, { status: 500 })
  }
}

/** DELETE /api/budget-requisitions/[id]/attachments?attachmentId=xxx */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const gate = await checkBudgetReqAccess(ctx)
  if (gate) return gate

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const attachmentId = searchParams.get('attachmentId')
  if (!attachmentId) return NextResponse.json({ error: 'attachmentId required' }, { status: 400 })

  const isHR = HR_ROLES.has(ctx.role ?? '')
  const employee = isHR ? null : await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })

  const attachment = await prisma.budgetRequisitionAttachment.findFirst({
    where: {
      id: attachmentId,
      requisitionId: id,
      requisition: isHR
        ? { companyId: ctx.companyId! }
        : { employeeId: employee?.id ?? '__none__', status: 'PENDING' },
    },
  })
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete from Supabase Storage (full https URL) or legacy local path
  if (attachment.fileUrl.startsWith('http')) {
    const bucket = getStorageBucket()
    const supabase = getSupabaseAdmin()
    const objectPath = objectPathFromUrl(attachment.fileUrl, bucket)
    if (objectPath) {
      await supabase.storage.from(bucket).remove([objectPath]).catch(() => {})
    }
  } else if (attachment.fileUrl.startsWith('/uploads/')) {
    // Legacy local storage fallback (dev only)
    const { unlink } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const localPath = join(process.cwd(), 'public', attachment.fileUrl.replace(/^\/+/, ''))
    await unlink(localPath).catch(() => {})
  }

  await prisma.budgetRequisitionAttachment.delete({ where: { id: attachmentId } })
  return NextResponse.json({ ok: true })
}
