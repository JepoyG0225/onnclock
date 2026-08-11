/**
 * Company task labels.
 *
 * GET    /api/task-labels
 * POST   /api/task-labels            — create (any member; labels emerge from work)
 * PATCH  /api/task-labels            — rename / recolour (managers)
 * DELETE /api/task-labels?labelId=…  — delete, detaching it from every task
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { guardTasks } from '@/lib/tasks/guard'

const createSchema = z.object({
  name: z.string().trim().min(1).max(32),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

const patchSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(32).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function GET(req: NextRequest) {
  const guard = await guardTasks(req)
  if (!guard.ok) return guard.response
  const labels = await prisma.taskLabel.findMany({
    where: { companyId: guard.companyId },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ labels })
}

export async function POST(req: NextRequest) {
  const guard = await guardTasks(req)
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  // Creating an existing label is a no-op rather than an error — the client
  // often can't know whether someone else already added it.
  const existing = await prisma.taskLabel.findFirst({
    where: { companyId: guard.companyId, name: parsed.data.name },
  })
  if (existing) return NextResponse.json({ label: existing })

  const label = await prisma.taskLabel.create({
    data: {
      companyId: guard.companyId,
      name: parsed.data.name,
      color: parsed.data.color ?? '#6366f1',
    },
  })
  return NextResponse.json({ label }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const guard = await guardTasks(req, 'manage')
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const owned = await prisma.taskLabel.findFirst({
    where: { id: parsed.data.id, companyId: guard.companyId },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Label not found' }, { status: 404 })

  const label = await prisma.taskLabel.update({
    where: { id: parsed.data.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
    },
  })
  return NextResponse.json({ label })
}

export async function DELETE(req: NextRequest) {
  const guard = await guardTasks(req, 'manage')
  if (!guard.ok) return guard.response

  const labelId = req.nextUrl.searchParams.get('labelId')
  if (!labelId) return NextResponse.json({ error: 'labelId is required' }, { status: 400 })

  const owned = await prisma.taskLabel.findFirst({
    where: { id: labelId, companyId: guard.companyId },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Label not found' }, { status: 404 })

  await prisma.taskLabel.delete({ where: { id: labelId } })
  return NextResponse.json({ ok: true })
}
