import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { ctx, error } = await requireAuth()
    if (error) return error

    const employee = await prisma.employee.findFirst({ where: { id, companyId: ctx.companyId }, select: { id: true } })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const form = await req.formData()
    const value = form.get('file')
    if (!(value instanceof File)) return NextResponse.json({ error: 'No image selected' }, { status: 400 })
    if (!value.type.startsWith('image/')) return NextResponse.json({ error: 'Please select an image file' }, { status: 400 })
    if (value.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Image must be 10MB or less' }, { status: 413 })

    const mimeExt = value.type.split('/')[1] || 'png'
    const ext = mimeExt.includes('jpeg') ? 'jpg' : mimeExt.split('+')[0]
    const filename = `employee-${employee.id}-${Date.now()}.${ext}`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'profile')
    await mkdir(uploadDir, { recursive: true })
    await writeFile(path.join(uploadDir, filename), Buffer.from(await value.arrayBuffer()))

    const photoUrl = `/uploads/profile/${filename}`
    await prisma.employee.update({ where: { id: employee.id }, data: { photoUrl } })
    return NextResponse.json({ photoUrl })
  } catch (error) {
    console.error('Employee photo upload error:', error)
    return NextResponse.json({ error: 'Failed to upload profile picture' }, { status: 500 })
  }
}
