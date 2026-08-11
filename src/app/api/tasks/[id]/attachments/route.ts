/**
 * Task file attachments, stored in Supabase Storage.
 *
 * GET    /api/tasks/[id]/attachments
 * POST   /api/tasks/[id]/attachments            — multipart upload
 * DELETE /api/tasks/[id]/attachments?attachmentId=…
 *
 * Follows the budget-requisition attachment route: same bucket resolution,
 * same MIME allow-list approach, same "delete the object if the DB insert
 * fails" cleanup so storage never orphans a file.
 */
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { guardTask } from '@/lib/tasks/guard'
import { logTaskActivity } from '@/lib/tasks/activity'

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB, matching budget attachments
const MAX_PER_TASK = 20

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

function getStorageBucket() {
  return process.env.SUPABASE_ATTACHMENTS_BUCKET || process.env.SUPABASE_LOGO_BUCKET || 'company-logos'
}

/** Recover the storage object path from a public URL, for deletion. */
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


async function listAttachments(taskId: string) {
  const rows = await prisma.taskAttachment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  })
  const userIds = Array.from(new Set(rows.map(r => r.uploadedByUserId)))
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const nameById = new Map(users.map(u => [u.id, u.name || u.email || 'Unknown user']))
  return rows.map(r => ({ ...r, uploadedByName: nameById.get(r.uploadedByUserId) ?? 'Unknown user' }))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardTask(req, id, 'view')
  if (!g.ok) return g.response
  return NextResponse.json({ attachments: await listAttachments(id) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardTask(req, id, 'edit')
  if (!g.ok) return g.response
  const guard = g

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Allowed: PDF, images, TXT, CSV, ZIP, Word, Excel, PowerPoint' },
      { status: 400 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds the 20 MB limit' }, { status: 400 })
  }

  const existing = await prisma.taskAttachment.count({ where: { taskId: id } })
  if (existing >= MAX_PER_TASK) {
    return NextResponse.json({ error: `Maximum ${MAX_PER_TASK} attachments per task` }, { status: 400 })
  }

  const ext = EXT_BY_MIME[file.type] ?? 'bin'
  const objectPath = `task-attachments/${guard.companyId}/${id}/${Date.now()}-${randomUUID()}.${ext}`
  const bucket = getStorageBucket()

  const supabase = getSupabaseAdmin()
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, bytes, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('[task attachments] Supabase upload failed:', uploadError)
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(objectPath)

  try {
    await prisma.taskAttachment.create({
      data: {
        taskId: id,
        fileName: file.name || `file.${ext}`,
        fileUrl: urlData.publicUrl,
        fileSize: file.size,
        mimeType: file.type,
        uploadedByUserId: guard.ctx.userId,
      },
    })
  } catch (err) {
    // Don't leave the uploaded object behind if the row couldn't be written.
    await supabase.storage.from(bucket).remove([objectPath]).catch(() => {})
    console.error('[task attachments] DB insert failed:', err)
    return NextResponse.json({ error: 'Failed to save the attachment record' }, { status: 500 })
  }

  await logTaskActivity({
    taskId: id,
    userId: guard.ctx.userId,
    action: 'attached',
    meta: { fileName: file.name },
  })

  return NextResponse.json({ attachments: await listAttachments(id) }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardTask(req, id, 'edit')
  if (!g.ok) return g.response
  const guard = g

  const attachmentId = req.nextUrl.searchParams.get('attachmentId')
  if (!attachmentId) {
    return NextResponse.json({ error: 'attachmentId is required' }, { status: 400 })
  }

  const attachment = await prisma.taskAttachment.findFirst({
    where: { id: attachmentId, taskId: id },
  })
  if (!attachment) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

  // Uploader can remove their own; managers can remove any.
  if (attachment.uploadedByUserId !== guard.ctx.userId && !guard.actor.canManage) {
    return NextResponse.json(
      { error: 'You can only remove attachments you uploaded' },
      { status: 403 },
    )
  }

  if (attachment.fileUrl.startsWith('http')) {
    const bucket = getStorageBucket()
    const objectPath = objectPathFromUrl(attachment.fileUrl, bucket)
    if (objectPath) {
      await getSupabaseAdmin().storage.from(bucket).remove([objectPath]).catch(() => {})
    }
  }

  await prisma.taskAttachment.delete({ where: { id: attachmentId } })
  return NextResponse.json({ attachments: await listAttachments(id) })
}
