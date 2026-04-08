import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    const employee = await prisma.employee.findFirst({
      where: { userId: ctx.userId, companyId: ctx.companyId },
    })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const contentType = req.headers.get('content-type') || ''
    let buffer: Buffer
    let mimeType = contentType

    if (contentType.startsWith('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      if (!file || typeof (file as File).arrayBuffer !== 'function') {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
      }
      const uploadFile = file as File
      mimeType = uploadFile.type
      if (!mimeType?.startsWith('image/')) {
        return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
      }
      if (uploadFile.size > 50 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image must be 50MB or less' }, { status: 413 })
      }
      const bytes = await uploadFile.arrayBuffer()
      buffer = Buffer.from(bytes)
    } else {
      if (!mimeType.startsWith('image/')) {
        return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
      }
      const bytes = await req.arrayBuffer()
      if (bytes.byteLength > 50 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image must be 50MB or less' }, { status: 413 })
      }
      buffer = Buffer.from(bytes)
    }

    const mimeExt = mimeType.split('/')[1] || 'png'
    const ext = mimeExt.includes('jpeg') ? 'jpg' : mimeExt.split('+')[0]
    const filename = `employee-${employee.id}-${Date.now()}.${ext}`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'profile')
    await mkdir(uploadDir, { recursive: true })
    await writeFile(path.join(uploadDir, filename), buffer)

    const photoUrl = `/uploads/profile/${filename}`
    await prisma.employee.update({
      where: { id: employee.id },
      data: { photoUrl },
    })

    return NextResponse.json({ photoUrl })
  } catch (err) {
    console.error('Profile photo upload error:', err)
    const message = err instanceof Error ? err.message : 'Failed to upload photo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
