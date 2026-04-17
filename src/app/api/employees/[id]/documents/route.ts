import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanyPricePerSeat } from '@/lib/feature-gates'
import {
  formatStorage,
  getCompanyDocumentStorageLimitBytes,
  getCompanyDocumentStorageUsedBytes,
} from '@/lib/document-storage'

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
  const filename = `${Date.now()}-${randomUUID()}.${ext}`
  const dir = path.join(process.cwd(), 'public', 'uploads', 'employee-docs', ctx.companyId, id)
  await mkdir(dir, { recursive: true })
  const bytes = Buffer.from(await file.arrayBuffer())
  const absoluteFilePath = path.join(dir, filename)
  await writeFile(absoluteFilePath, bytes)

  const publicUrl = `/uploads/employee-docs/${ctx.companyId}/${id}/${filename}`

  try {
    const document = await prisma.employeeDocument.create({
      data: {
        employeeId: id,
        documentType,
        fileName: file.name || filename,
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
    await unlink(absoluteFilePath).catch(() => {})
    const message = e instanceof Error ? e.message : 'Failed to save document'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
