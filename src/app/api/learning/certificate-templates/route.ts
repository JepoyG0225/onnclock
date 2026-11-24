import { randomUUID } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireLearningAuth as requireAuth } from '@/lib/learning/access'
import { certificateStorage } from '@/lib/learning/certificate-storage'
import { templateFieldsSchema } from '@/lib/learning/certificate-template'

const roles = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']
export async function GET() {
  const { ctx, error } = await requireAuth(roles)
  if (error) return error
  const templates = await prisma.certificateTemplate.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: 'asc' } })
  if (!templates.length) return NextResponse.json({ templates: [] })
  try {
    const storage = await certificateStorage()
    const rows = await Promise.all(templates.map(async template => {
      const signed = await storage.createSignedUrl(template.backgroundPath, 3600)
      if (signed.error) throw signed.error
      return { ...template, previewUrl: signed.data.signedUrl }
    }))
    return NextResponse.json({ templates: rows }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Could not load certificate backgrounds. Please retry.' }, { status: 503 }) }
}
export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(roles)
  if (error) return error
  const form = await req.formData()
  const name = String(form.get('name') ?? '').trim()
  const file = form.get('file')
  if (!name || name.length > 150 || !(file instanceof File) || !['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'Enter a template name and upload a PNG or JPG certificate up to 4 MB.' }, { status: 422 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  let imageWidth: number, imageHeight: number
  try {
    const doc = await PDFDocument.create()
    const image = file.type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    imageWidth = image.width; imageHeight = image.height
    if (imageWidth < 100 || imageHeight < 100 || imageWidth > 10000 || imageHeight > 10000 || imageHeight / imageWidth > 3 || imageWidth / imageHeight > 3) throw new Error()
  } catch { return NextResponse.json({ error: 'Upload a valid certificate image between 100 and 10,000 pixels per side with a normal page aspect ratio.' }, { status: 422 }) }
  const backgroundPath = `${ctx.companyId}/${randomUUID()}.${file.type === 'image/png' ? 'png' : 'jpg'}`
  try {
    const storage = await certificateStorage()
    const uploaded = await storage.upload(backgroundPath, bytes, { contentType: file.type, upsert: false })
    if (uploaded.error) throw uploaded.error
    try {
      const template = await prisma.certificateTemplate.create({ data: { companyId: ctx.companyId, name, backgroundPath, backgroundMime: file.type, width: 842, height: 842 * imageHeight / imageWidth, fields: [] } })
      return NextResponse.json({ template }, { status: 201 })
    } catch (err) { await storage.remove([backgroundPath]); throw err }
  } catch { return NextResponse.json({ error: 'Could not save the certificate template. Please retry.' }, { status: 503 }) }
}
const saveSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(150), fields: templateFieldsSchema, courseId: z.string().min(1).optional() })
export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth(roles)
  if (error) return error
  const parsed = saveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 })
  const { id, name, fields, courseId } = parsed.data
  const template = await prisma.certificateTemplate.findFirst({ where: { id, companyId: ctx.companyId } })
  if (!template) return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
  if (fields.some(f => template.height * f.y / 100 + f.fontSize > template.height)) return NextResponse.json({ error: 'Move text fields fully inside the certificate.' }, { status: 422 })
  if (courseId && !await prisma.learningCourse.findFirst({ where: { id: courseId, companyId: ctx.companyId }, select: { id: true } })) return NextResponse.json({ error: 'Course not found.' }, { status: 404 })
  await prisma.$transaction(async tx => {
    await tx.certificateTemplate.update({ where: { id }, data: { name, fields } })
    if (courseId) await tx.learningCourse.update({ where: { id: courseId }, data: { certificateTemplateId: id } })
  })
  return NextResponse.json({ ok: true })
}
