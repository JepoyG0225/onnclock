import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanyPricePerSeat } from '@/lib/feature-gates'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  formatStorage,
  getCompanyDocumentStorageLimitBytes,
  getCompanyDocumentStorageUsedBytes,
} from '@/lib/document-storage'

// Vercel's filesystem is read-only, so documents go to Supabase Storage
// (same bucket strategy as budget-requisition attachments).
function getStorageBucket() {
  return process.env.SUPABASE_ATTACHMENTS_BUCKET || process.env.SUPABASE_LOGO_BUCKET || 'company-logos'
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function extensionFromMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'application/msword') return 'doc'
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  return 'bin'
}

async function getStorage(companyId: string) {
  const pricePerSeat = await getCompanyPricePerSeat(companyId)
  const usedBytes = await getCompanyDocumentStorageUsedBytes(companyId)
  const limitBytes = getCompanyDocumentStorageLimitBytes(pricePerSeat)
  return {
    pricePerSeat,
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
  }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const [documents, storage] = await Promise.all([
    prisma.employeeDocument.findMany({
      where: { employeeId: id },
      orderBy: { uploadedAt: 'desc' },
    }),
    getStorage(ctx.companyId),
  ])

  return NextResponse.json({
    documents,
    storage: {
      ...storage,
      usedLabel: formatStorage(storage.usedBytes),
      limitLabel: formatStorage(storage.limitBytes),
      remainingLabel: formatStorage(storage.remainingBytes),
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file')
  const documentType = String(formData.get('documentType') ?? '').trim()
  const expiresAtRaw = String(formData.get('expiresAt') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()

  if (!documentType) return NextResponse.json({ error: 'documentType is required' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })

  const maxSingleFileBytes = 25 * 1024 * 1024
  if (file.size > maxSingleFileBytes) {
    return NextResponse.json({ error: 'File exceeds 25MB limit' }, { status: 400 })
  }

  const storage = await getStorage(ctx.companyId)
  if (storage.usedBytes + file.size > storage.limitBytes) {
    return NextResponse.json(
      {
        error: `Storage limit exceeded for this plan (${formatStorage(storage.limitBytes)}).`,
        storage: {
          ...storage,
          usedLabel: formatStorage(storage.usedBytes),
          limitLabel: formatStorage(storage.limitBytes),
          remainingLabel: formatStorage(storage.remainingBytes),
        },
      },
      { status: 403 }
    )
  }

  const ext = extensionFromMime(file.type)
  const objectPath = `employee-docs/${ctx.companyId}/${id}/${Date.now()}-${randomUUID()}.${ext}`
  const bucket = getStorageBucket()
  const supabase = getSupabaseAdmin()
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, bytes, { contentType: file.type, upsert: false })
  if (uploadError) {
    console.error('[employee documents] Supabase upload error:', uploadError)
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(objectPath)
  const publicUrl = urlData.publicUrl

  try {
    const document = await prisma.employeeDocument.create({
      data: {
        employeeId: id,
        documentType,
        fileName: file.name || objectPath.split('/').pop() || 'document',
        fileUrl: publicUrl,
        expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : null,
        notes: notes || null,
      },
    })

    const nextStorage = await getStorage(ctx.companyId)
    return NextResponse.json(
      {
        document,
        storage: {
          ...nextStorage,
          usedLabel: formatStorage(nextStorage.usedBytes),
          limitLabel: formatStorage(nextStorage.limitBytes),
          remainingLabel: formatStorage(nextStorage.remainingBytes),
        },
      },
      { status: 201 }
    )
  } catch (e) {
    await supabase.storage.from(bucket).remove([objectPath]).catch(() => {})
    const message = e instanceof Error ? e.message : 'Failed to save document'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
