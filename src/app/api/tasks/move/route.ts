/**
 * POST /api/tasks/move — reposition a task after a board drag.
 *
 * The client sends the task's new neighbours rather than an index, so the
 * server can place it by midpoint between them. `Task.order` is a float
 * precisely so a drop writes ONE row instead of renumbering the status.
 *
 * When the gap between neighbours gets too small to split (repeated drops
 * into the same slot eventually exhaust float precision), the status is
 * renormalised to whole numbers and the placement retried.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { guardTask } from '@/lib/tasks/guard'
import { logTaskActivity } from '@/lib/tasks/activity'

const moveSchema = z.object({
  taskId: z.string(),
  statusId: z.string(),
  /** Task immediately above the drop position, if any. */
  afterTaskId: z.string().nullable().optional(),
  /** Task immediately below the drop position, if any. */
  beforeTaskId: z.string().nullable().optional(),
})

/** Below this the midpoint stops producing a distinct value — renormalise. */
const MIN_GAP = 0.0001

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = moveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { taskId, statusId, afterTaskId, beforeTaskId } = parsed.data

  const guard = await guardTask(req, taskId, 'edit')
  if (!guard.ok) return guard.response
  const { companyId } = guard

  const status = await prisma.taskStatus.findFirst({
    where: { id: statusId, companyId },
    select: { id: true, category: true },
  })
  if (!status) return NextResponse.json({ error: 'Status not found' }, { status: 400 })

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { statusId: true, completedAt: true },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // Neighbours must be in the destination status, otherwise the ordering
  // reference is meaningless.
  const neighbourIds = [afterTaskId, beforeTaskId].filter((v): v is string => Boolean(v))
  const neighbours = neighbourIds.length
    ? await prisma.task.findMany({
        where: { id: { in: neighbourIds }, companyId, statusId },
        select: { id: true, order: true },
      })
    : []
  const orderOf = (id: string | null | undefined) =>
    id ? neighbours.find(n => n.id === id)?.order ?? null : null

  const afterOrder = orderOf(afterTaskId)
  const beforeOrder = orderOf(beforeTaskId)

  let newOrder: number
  let needsRenormalise = false

  if (afterOrder !== null && beforeOrder !== null) {
    if (Math.abs(beforeOrder - afterOrder) < MIN_GAP) {
      needsRenormalise = true
      newOrder = afterOrder
    } else {
      newOrder = (afterOrder + beforeOrder) / 2
    }
  } else if (afterOrder !== null) {
    newOrder = afterOrder + 1
  } else if (beforeOrder !== null) {
    newOrder = beforeOrder - 1
  } else {
    // No neighbours supplied. That USUALLY means an empty status, but the
    // server must not assume it — hardcoding 0 collides with an existing row
    // whenever the status isn't actually empty, and because the board sorts
    // purely on `order`, tied rows then render in arbitrary order.
    const top = await prisma.task.findFirst({
      where: { companyId, statusId, id: { not: taskId } },
      orderBy: { order: 'asc' },
      select: { order: true },
    })
    newOrder = top ? top.order - 1 : 0
  }

  const movingIntoDone = status.category === 'DONE' && task.statusId !== statusId
  const movingOutOfDone = status.category !== 'DONE' && task.statusId !== statusId

  await prisma.task.update({
    where: { id: taskId },
    data: {
      statusId,
      order: newOrder,
      ...(movingIntoDone ? { completedAt: task.completedAt ?? new Date() } : {}),
      ...(movingOutOfDone ? { completedAt: null } : {}),
    },
  })

  if (needsRenormalise) {
    // Rewrite the whole status to clean integer ranks, preserving the order
    // the rows currently sort in (the moved task included).
    const rows = await prisma.task.findMany({
      where: { companyId, statusId },
      orderBy: [{ order: 'asc' }, { updatedAt: 'asc' }],
      select: { id: true },
    })
    await prisma.$transaction(
      rows.map((r, i) => prisma.task.update({ where: { id: r.id }, data: { order: i } })),
    )
  }

  if (task.statusId !== statusId) {
    await logTaskActivity({
      taskId,
      userId: guard.ctx.userId,
      action: movingIntoDone ? 'completed' : movingOutOfDone && task.completedAt ? 'reopened' : 'moved',
    })
  }

  const updated = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, statusId: true, order: true, completedAt: true },
  })
  return NextResponse.json({ task: updated, renormalised: needsRenormalise })
}
