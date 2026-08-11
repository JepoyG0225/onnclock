/**
 * GET  /api/tasks — the company's tasks, filtered and grouped for any view
 * POST /api/tasks — create a task
 *
 * One endpoint feeds Board, List, Table and Calendar; the `groupBy` parameter
 * only changes how rows are bucketed, never which rows come back, so
 * switching views can't change what you're looking at.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { guardTasks } from '@/lib/tasks/guard'
import { ensureTaskStatuses, defaultStatusId, taskKey } from '@/lib/tasks/access'
import { TASK_LIST_INCLUDE, shapeTask } from '@/lib/tasks/select'
import { logTaskActivity, notifyTaskAssigned } from '@/lib/tasks/activity'
import type { Prisma } from '@prisma/client'

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20000).optional().nullable(),
  statusId: z.string().optional(),
  parentTaskId: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  estimateHours: z.coerce.number().nonnegative().optional().nullable(),
  assigneeEmployeeIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional(),
})

export async function GET(req: NextRequest) {
  const guard = await guardTasks(req)
  if (!guard.ok) return guard.response
  const { companyId, actor } = guard

  const sp = req.nextUrl.searchParams
  const q = sp.get('q')?.trim() || undefined
  const statusId = sp.get('statusId') || undefined
  const assignee = sp.get('assignee') || undefined
  const labelId = sp.get('labelId') || undefined
  const priority = sp.get('priority') || undefined
  const mine = sp.get('mine') === '1'
  const includeDone = sp.get('includeDone') !== '0'
  const includeSubtasks = sp.get('includeSubtasks') === '1'

  const statuses = await ensureTaskStatuses(companyId)

  const and: Prisma.TaskWhereInput[] = [{ companyId }]
  if (!includeSubtasks) and.push({ parentTaskId: null })
  if (statusId) and.push({ statusId })
  if (priority) and.push({ priority: priority as Prisma.TaskWhereInput['priority'] })
  if (labelId) and.push({ labels: { some: { labelId } } })
  if (assignee) and.push({ assignees: { some: { employeeId: assignee } } })
  if (mine && actor.employeeId) and.push({ assignees: { some: { employeeId: actor.employeeId } } })
  if (!includeDone) and.push({ status: { category: { not: 'DONE' } } })
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    })
  }

  const tasks = await prisma.task.findMany({
    where: { AND: and },
    include: TASK_LIST_INCLUDE,
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    take: 1000,
  })

  // Logged hours per task, in one grouped query rather than N.
  const logged = tasks.length
    ? await prisma.taskTimeLog.groupBy({
        by: ['taskId'],
        where: { taskId: { in: tasks.map(t => t.id) } },
        _sum: { hours: true },
      })
    : []
  const hoursByTask = new Map(logged.map(l => [l.taskId, Number(l._sum.hours ?? 0)]))

  const doneChecklist = tasks.length
    ? await prisma.taskChecklistItem.groupBy({
        by: ['taskId'],
        where: { taskId: { in: tasks.map(t => t.id) }, isDone: true },
        _count: { _all: true },
      })
    : []
  const checklistDone = new Map(doneChecklist.map(c => [c.taskId, c._count._all]))

  return NextResponse.json({
    statuses,
    tasks: tasks.map(t => ({
      ...shapeTask(t),
      loggedHours: hoursByTask.get(t.id) ?? 0,
      checklistDone: checklistDone.get(t.id) ?? 0,
    })),
    viewerEmployeeId: actor.employeeId,
    canManage: actor.canManage,
  })
}

export async function POST(req: NextRequest) {
  const guard = await guardTasks(req)
  if (!guard.ok) return guard.response
  const { ctx, companyId } = guard

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const d = parsed.data

  const statuses = await ensureTaskStatuses(companyId)
  const fallbackId = await defaultStatusId(companyId)
  const status =
    statuses.find(s => s.id === d.statusId) ??
    statuses.find(s => s.id === fallbackId) ??
    statuses[0]
  if (!status) {
    return NextResponse.json({ error: 'No task statuses configured' }, { status: 400 })
  }

  // Only same-company employees may be assigned.
  const validAssignees = d.assigneeEmployeeIds?.length
    ? await prisma.employee.findMany({
        where: { id: { in: d.assigneeEmployeeIds }, companyId },
        select: { id: true },
      })
    : []

  const validLabels = d.labelIds?.length
    ? await prisma.taskLabel.findMany({
        where: { id: { in: d.labelIds }, companyId },
        select: { id: true },
      })
    : []

  // Subtasks must belong to the same company as their parent.
  if (d.parentTaskId) {
    const parent = await prisma.task.findFirst({
      where: { id: d.parentTaskId, companyId },
      select: { id: true },
    })
    if (!parent) return NextResponse.json({ error: 'Parent task not found' }, { status: 400 })
  }

  // New tasks go to the top of their status.
  const first = await prisma.task.findFirst({
    where: { companyId, statusId: status.id },
    orderBy: { order: 'asc' },
    select: { order: true },
  })
  const order = first ? first.order - 1 : 0

  // Bump the counter and create in one transaction so two concurrent creates
  // can't be handed the same number.
  const created = await prisma.$transaction(async tx => {
    const company = await tx.company.update({
      where: { id: companyId },
      data: { taskCounter: { increment: 1 } },
      select: { taskCounter: true },
    })

    return tx.task.create({
      data: {
        companyId,
        statusId: status.id,
        parentTaskId: d.parentTaskId || null,
        number: company.taskCounter,
        title: d.title,
        description: d.description ?? null,
        priority: d.priority ?? 'MEDIUM',
        order,
        startDate: d.startDate ? new Date(d.startDate) : null,
        dueDate: d.dueDate ? new Date(d.dueDate) : null,
        estimateHours: d.estimateHours ?? null,
        completedAt: status.category === 'DONE' ? new Date() : null,
        createdByUserId: ctx.userId,
        assignees: { create: validAssignees.map(a => ({ employeeId: a.id })) },
        labels: { create: validLabels.map(l => ({ labelId: l.id })) },
      },
      include: TASK_LIST_INCLUDE,
    })
  })

  await logTaskActivity({
    taskId: created.id,
    userId: ctx.userId,
    action: 'created',
    meta: { title: d.title },
  })

  if (validAssignees.length) {
    await notifyTaskAssigned({
      companyId,
      employeeIds: validAssignees.map(a => a.id),
      actorUserId: ctx.userId,
      taskKey: taskKey(created.number),
      taskTitle: created.title,
      taskId: created.id,
    })
  }

  return NextResponse.json({ task: shapeTask(created) }, { status: 201 })
}
