/**
 * Company task statuses — the Kanban axis.
 *
 * GET    /api/task-statuses            — ordered list (seeds defaults on first use)
 * POST   /api/task-statuses            — add a status
 * PATCH  /api/task-statuses            — rename / recolour / reorder / set default
 * DELETE /api/task-statuses?statusId=…&moveTo=…
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { guardTasks } from '@/lib/tasks/guard'
import { ensureTaskStatuses } from '@/lib/tasks/access'

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  category: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
  wipLimit: z.coerce.number().int().positive().nullable().optional(),
})

const patchSchema = z.object({
  /** Full ordered list of status ids — sent after a drag. */
  order: z.array(z.string()).optional(),
  update: z
    .object({
      id: z.string(),
      name: z.string().trim().min(1).max(40).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      category: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
      isDefault: z.boolean().optional(),
      wipLimit: z.coerce.number().int().positive().nullable().optional(),
    })
    .optional(),
})

export async function GET(req: NextRequest) {
  const guard = await guardTasks(req)
  if (!guard.ok) return guard.response
  const statuses = await ensureTaskStatuses(guard.companyId)
  return NextResponse.json({ statuses, canManage: guard.actor.canManage })
}

export async function POST(req: NextRequest) {
  const guard = await guardTasks(req, 'manage')
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const clash = await prisma.taskStatus.findFirst({
    where: { companyId: guard.companyId, name: parsed.data.name },
    select: { id: true },
  })
  if (clash) return NextResponse.json({ error: 'A status with that name already exists' }, { status: 409 })

  const last = await prisma.taskStatus.findFirst({
    where: { companyId: guard.companyId },
    orderBy: { order: 'desc' },
    select: { order: true },
  })

  await prisma.taskStatus.create({
    data: {
      companyId: guard.companyId,
      name: parsed.data.name,
      color: parsed.data.color ?? '#64748b',
      category: parsed.data.category ?? 'TODO',
      wipLimit: parsed.data.wipLimit ?? null,
      order: (last?.order ?? -1) + 1,
    },
  })

  const statuses = await prisma.taskStatus.findMany({
    where: { companyId: guard.companyId },
    orderBy: { order: 'asc' },
  })
  return NextResponse.json({ statuses }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const guard = await guardTasks(req, 'manage')
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { order, update } = parsed.data

  if (order?.length) {
    // Scope to this company so a crafted payload can't reorder another tenant.
    const owned = await prisma.taskStatus.findMany({
      where: { companyId: guard.companyId, id: { in: order } },
      select: { id: true },
    })
    const ownedIds = new Set(owned.map(s => s.id))
    await prisma.$transaction(
      order
        .filter(id => ownedIds.has(id))
        .map((id, index) => prisma.taskStatus.update({ where: { id }, data: { order: index } })),
    )
  }

  if (update) {
    const owned = await prisma.taskStatus.findFirst({
      where: { id: update.id, companyId: guard.companyId },
      select: { id: true },
    })
    if (!owned) return NextResponse.json({ error: 'Status not found' }, { status: 404 })

    // Exactly one default per company.
    if (update.isDefault === true) {
      await prisma.taskStatus.updateMany({
        where: { companyId: guard.companyId },
        data: { isDefault: false },
      })
    }

    await prisma.taskStatus.update({
      where: { id: update.id },
      data: {
        ...(update.name !== undefined ? { name: update.name } : {}),
        ...(update.color !== undefined ? { color: update.color } : {}),
        ...(update.category !== undefined ? { category: update.category } : {}),
        ...(update.isDefault !== undefined ? { isDefault: update.isDefault } : {}),
        ...(update.wipLimit !== undefined ? { wipLimit: update.wipLimit } : {}),
      },
    })

    // Category changes retroactively fix completion: tasks sitting in a status
    // that now means DONE should carry a completion date, and vice versa.
    if (update.category !== undefined) {
      if (update.category === 'DONE') {
        await prisma.task.updateMany({
          where: { statusId: update.id, completedAt: null },
          data: { completedAt: new Date() },
        })
      } else {
        await prisma.task.updateMany({
          where: { statusId: update.id, completedAt: { not: null } },
          data: { completedAt: null },
        })
      }
    }
  }

  const statuses = await prisma.taskStatus.findMany({
    where: { companyId: guard.companyId },
    orderBy: { order: 'asc' },
  })
  return NextResponse.json({ statuses })
}

export async function DELETE(req: NextRequest) {
  const guard = await guardTasks(req, 'manage')
  if (!guard.ok) return guard.response

  const statusId = req.nextUrl.searchParams.get('statusId')
  const moveTo = req.nextUrl.searchParams.get('moveTo')
  if (!statusId) return NextResponse.json({ error: 'statusId is required' }, { status: 400 })

  const statuses = await prisma.taskStatus.findMany({
    where: { companyId: guard.companyId },
    orderBy: { order: 'asc' },
    select: { id: true, isDefault: true },
  })
  if (!statuses.some(s => s.id === statusId)) {
    return NextResponse.json({ error: 'Status not found' }, { status: 404 })
  }
  if (statuses.length <= 1) {
    return NextResponse.json({ error: 'A board needs at least one status' }, { status: 400 })
  }

  // Tasks would be orphaned by the delete, so relocate them first — removing
  // a status must never destroy work.
  const target = moveTo && statuses.some(s => s.id === moveTo && s.id !== statusId)
    ? moveTo
    : statuses.find(s => s.id !== statusId)!.id

  await prisma.task.updateMany({ where: { statusId }, data: { statusId: target } })

  const wasDefault = statuses.find(s => s.id === statusId)?.isDefault
  await prisma.taskStatus.delete({ where: { id: statusId } })
  if (wasDefault) {
    await prisma.taskStatus.update({ where: { id: target }, data: { isDefault: true } })
  }

  const remaining = await prisma.taskStatus.findMany({
    where: { companyId: guard.companyId },
    orderBy: { order: 'asc' },
  })
  return NextResponse.json({ statuses: remaining, movedTo: target })
}
