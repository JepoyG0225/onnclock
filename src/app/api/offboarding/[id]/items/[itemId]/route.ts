import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const patchSchema = z.object({
  isDone: z.boolean(),
  notes: z.string().nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { id, itemId } = await params

  // Verify the process belongs to this company
  const process = await prisma.offboardingProcess.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!process) {
    return NextResponse.json({ error: 'Offboarding process not found' }, { status: 404 })
  }

  // Verify the item belongs to this process
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

  const updateData: Record<string, unknown> = { isDone: parsed.data.isDone }
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes
  if (parsed.data.isDone) updateData.doneAt = new Date()
  else updateData.doneAt = null

  const item = await prisma.offboardingItem.update({
    where: { id: itemId },
    data: updateData,
  })

  return NextResponse.json({ item })
}
