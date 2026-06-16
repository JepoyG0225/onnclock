import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

function getStorageBucket() {
  return process.env.SUPABASE_ATTACHMENTS_BUCKET || process.env.SUPABASE_LOGO_BUCKET || 'company-logos'
}

// Legacy local-FS path (pre-Supabase uploads).
function toAbsoluteLocalPath(fileUrl: string): string | null {
  if (!fileUrl.startsWith('/uploads/employee-docs/')) return null
  return path.join(process.cwd(), 'public', fileUrl.replace(/^\/+/, ''))
}

// Extract the Supabase Storage object path from a public URL.
function objectPathFromUrl(fileUrl: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = fileUrl.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(fileUrl.slice(idx + marker.length))
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const doc = await prisma.employeeDocument.findFirst({
    where: { id: docId, employeeId: id },
    select: { id: true, fileUrl: true },
  })
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  await prisma.employeeDocument.delete({ where: { id: doc.id } })

  // Best-effort file cleanup — never block the delete on storage errors.
  const bucket = getStorageBucket()
  const objectPath = objectPathFromUrl(doc.fileUrl, bucket)
  if (objectPath) {
    await getSupabaseAdmin().storage.from(bucket).remove([objectPath]).catch(() => {})
  } else {
    const abs = toAbsoluteLocalPath(doc.fileUrl)
    if (abs) await unlink(abs).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
