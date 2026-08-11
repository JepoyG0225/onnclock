/**
 * POST   /api/tasks/[id]/checklist            — add an item
 * PATCH  /api/tasks/[id]/checklist            — tick / rename an item
 * DELETE /api/tasks/[id]/checklist?itemId=…   — remove an item
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { guardTask } from '@/lib/tasks/guard'

const createSchema = z.object({ text: z.string().trim().min(1).max(300) })
const patchSchema = z.object({
  itemId: z.string(),
  text: z.string().trim().min(1).max(300).optional(),
  isDone: z.boolean().optional(),
})

/** Auth + edit rights on the task's project, plus the resolved project id. */

async function listItems(taskId: string) {
  return prisma.taskChecklistItem.findMany({ where: { taskId }, orderBy: { order: 'asc' } })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardTask(req, id, 'edit')
  if (!g.ok) return g.response

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const last = await prisma.taskChecklistItem.findFirst({
    where: { taskId: id },
    orderBy: { order: 'desc' },
    select: { order: true },
  })

  await prisma.taskChecklistItem.create({
    data: { taskId: id, text: parsed.data.text, order: (last?.order ?? -1) + 1 },
  })

  return NextResponse.json({ checklist: await listItems(id) }, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardTask(req, id, 'edit')
  if (!g.ok) return g.response

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  // Scope by taskId so an item id from another task can't be edited here.
  const owned = await prisma.taskChecklistItem.findFirst({
    where: { id: parsed.data.itemId, taskId: id },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 })

  await prisma.taskChecklistItem.update({
    where: { id: parsed.data.itemId },
    data: {
      ...(parsed.data.text !== undefined ? { text: parsed.data.text } : {}),
      ...(parsed.data.isDone !== undefined ? { isDone: parsed.data.isDone } : {}),
    },
  })

  return NextResponse.json({ checklist: await listItems(id) })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardTask(req, id, 'edit')
  if (!g.ok) return g.response

  const itemId = req.nextUrl.searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 })

  const owned = await prisma.taskChecklistItem.findFirst({
    where: { id: itemId, taskId: id },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 })

  await prisma.taskChecklistItem.delete({ where: { id: itemId } })
  return NextResponse.json({ checklist: await listItems(id) })
}
