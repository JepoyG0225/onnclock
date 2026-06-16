import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

const patchSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const { itemId } = await params

  const existing = await prisma.offboardingTemplateItem.findFirst({
    where: { id: itemId, companyId: ctx.companyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const updateData: Record<string, unknown> = {}
  if (parsed.data.category !== undefined) updateData.category = parsed.data.category.trim()
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title.trim()
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description?.trim() ?? null
  if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder

  const item = await prisma.offboardingTemplateItem.update({
    where: { id: itemId },
    data: updateData,
  })

  return NextResponse.json({ item })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const { itemId } = await params

  const existing = await prisma.offboardingTemplateItem.findFirst({
    where: { id: itemId, companyId: ctx.companyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.offboardingTemplateItem.delete({ where: { id: itemId } })

  return NextResponse.json({ ok: true })
}
