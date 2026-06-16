import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const patchSchema = z.object({
  isDone: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: z.string().min(1).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { id, itemId } = await params

  const process = await prisma.offboardingProcess.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!process) {
    return NextResponse.json({ error: 'Offboarding process not found' }, { status: 404 })
  }

  const existing = await prisma.offboardingItem.findFirst({
    where: { id: itemId, processId: id },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const updateData: Record<string, unknown> = {}
  if (parsed.data.isDone !== undefined) {
    updateData.isDone = parsed.data.isDone
    updateData.doneAt = parsed.data.isDone ? new Date() : null
  }
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description
  if (parsed.data.category !== undefined) updateData.category = parsed.data.category

  const item = await prisma.offboardingItem.update({
    where: { id: itemId },
    data: updateData,
  })

  return NextResponse.json({ item })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { id, itemId } = await params

  const process = await prisma.offboardingProcess.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!process) {
    return NextResponse.json({ error: 'Offboarding process not found' }, { status: 404 })
  }

  const existing = await prisma.offboardingItem.findFirst({
    where: { id: itemId, processId: id },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 })
  }

  await prisma.offboardingItem.delete({ where: { id: itemId } })

  return NextResponse.json({ ok: true })
}
