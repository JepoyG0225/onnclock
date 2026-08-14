/**
 * GET    /api/tasks/[id] — full task: subtasks, checklist, comments, files, time
 * PATCH  /api/tasks/[id] — update fields, assignees and labels
 * DELETE /api/tasks/[id]
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { guardTask } from '@/lib/tasks/guard'
import { logTaskActivity, notifyTaskAssigned } from '@/lib/tasks/activity'
import { ensureTaskReviewStatus, taskKey } from '@/lib/tasks/access'
import { TASK_LIST_INCLUDE, EMPLOYEE_BRIEF_SELECT, shapeTask } from '@/lib/tasks/select'

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  statusId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimateHours: z.coerce.number().nonnegative().nullable().optional(),
  /** Full replacement lists — simpler for the client than add/remove deltas. */
  assigneeEmployeeIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await guardTask(req, id, 'view')
  if (!guard.ok) return guard.response

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      status: { select: { id: true, name: true, color: true, category: true } },
      parent: { select: { id: true, number: true, title: true } },
      assignees: { select: { employee: { select: EMPLOYEE_BRIEF_SELECT } } },
      labels: { select: { label: { select: { id: true, name: true, color: true } } } },
      checklist: { orderBy: { order: 'asc' } },
      subtasks: { orderBy: { order: 'asc' }, include: TASK_LIST_INCLUDE },
      comments: { orderBy: { createdAt: 'asc' } },
      attachments: { orderBy: { createdAt: 'asc' } },
      activity: { orderBy: { createdAt: 'desc' }, take: 50 },
      timeLogs: { orderBy: { date: 'desc' }, include: { employee: { select: EMPLOYEE_BRIEF_SELECT } } },
      dependencies: {
        include: { dependsOn: { select: { id: true, number: true, title: true, completedAt: true } } },
      },
    },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // Comment/activity/upload actors are bare user ids (matching AuditLog), so
  // resolve display names in one batch.
  const userIds = Array.from(
    new Set([
      ...task.comments.map(c => c.userId),
      ...task.attachments.map(a => a.uploadedByUserId),
      ...task.activity.map(a => a.userId).filter((u): u is string => Boolean(u)),
    ]),
  )
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : []
  const userById = new Map(users.map(u => [u.id, u]))
  const nameOf = (userId: string | null) => {
    if (!userId) return 'System'
    const u = userById.get(userId)
    return u?.name || u?.email || 'Unknown user'
  }

  return NextResponse.json({
    task: {
      ...task,
      key: taskKey(task.number),
      estimateHours: task.estimateHours === null ? null : Number(task.estimateHours),
      assignees: task.assignees.map(a => a.employee),
      labels: task.labels.map(l => l.label),
      subtasks: task.subtasks.map(shapeTask),
      comments: task.comments.map(c => ({ ...c, authorName: nameOf(c.userId) })),
      attachments: task.attachments.map(a => ({ ...a, uploadedByName: nameOf(a.uploadedByUserId) })),
      activity: task.activity.map(a => ({ ...a, actorName: nameOf(a.userId) })),
      timeLogs: task.timeLogs.map(l => ({ ...l, hours: Number(l.hours) })),
      loggedHours: task.timeLogs.reduce((sum, l) => sum + Number(l.hours), 0),
    },
    access: { canEdit: guard.canEdit, canManage: guard.actor.canManage },
    viewerEmployeeId: guard.actor.employeeId,
    viewerUserId: guard.ctx.userId,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await guardTask(req, id, 'edit')
  if (!guard.ok) return guard.response
  const { companyId, ctx } = guard

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const d = parsed.data

  const before = await prisma.task.findUnique({
    where: { id },
    select: {
      title: true, statusId: true, priority: true, dueDate: true,
      number: true, completedAt: true,
      assignees: { select: { employeeId: true } },
    },
  })
  if (!before) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // Status category is what decides completion, so the board stays the single
  // source of truth for task state.
  let effectiveStatusId = d.statusId
  let submittedForReview = false
  let completedAt: Date | null | undefined
  let movedToDone = false
  if (d.statusId && d.statusId !== before.statusId) {
    let status = await prisma.taskStatus.findFirst({
      where: { id: d.statusId, companyId },
      select: { id: true, category: true },
    })
    if (!status) return NextResponse.json({ error: 'Status not found' }, { status: 400 })

    // Employees can finish their work, but an administrator must approve the
    // completion. Enforce this here so a direct API request cannot bypass the
    // review step used by the employee portal.
    if (status.category === 'DONE' && !guard.actor.canManage) {
      const reviewStatus = await ensureTaskReviewStatus(companyId)
      effectiveStatusId = reviewStatus.id
      status = { id: reviewStatus.id, category: reviewStatus.category }
      submittedForReview = true
    }
    movedToDone = status.category === 'DONE'
    completedAt = movedToDone ? before.completedAt ?? new Date() : null
  }

  const validAssignees = d.assigneeEmployeeIds
    ? await prisma.employee.findMany({
        where: { id: { in: d.assigneeEmployeeIds }, companyId },
        select: { id: true },
      })
    : null

  const validLabels = d.labelIds
    ? await prisma.taskLabel.findMany({
        where: { id: { in: d.labelIds }, companyId },
        select: { id: true },
      })
    : null

  await prisma.$transaction(async tx => {
    await tx.task.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(effectiveStatusId !== undefined ? { statusId: effectiveStatusId } : {}),
        ...(d.priority !== undefined ? { priority: d.priority } : {}),
        ...(d.startDate !== undefined ? { startDate: d.startDate ? new Date(d.startDate) : null } : {}),
        ...(d.dueDate !== undefined ? { dueDate: d.dueDate ? new Date(d.dueDate) : null } : {}),
        ...(d.estimateHours !== undefined ? { estimateHours: d.estimateHours } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
      },
    })

    if (validAssignees) {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } })
      if (validAssignees.length) {
        await tx.taskAssignee.createMany({
          data: validAssignees.map(a => ({ taskId: id, employeeId: a.id })),
          skipDuplicates: true,
        })
      }
    }

    if (validLabels) {
      await tx.taskLabelLink.deleteMany({ where: { taskId: id } })
      if (validLabels.length) {
        await tx.taskLabelLink.createMany({
          data: validLabels.map(l => ({ taskId: id, labelId: l.id })),
          skipDuplicates: true,
        })
      }
    }
  })

  // Activity trail — one entry per meaningful change.
  const actor = ctx.userId
  if (d.title && d.title !== before.title) {
    await logTaskActivity({ taskId: id, userId: actor, action: 'renamed', meta: { from: before.title, to: d.title } })
  }
  if (effectiveStatusId && effectiveStatusId !== before.statusId) {
    await logTaskActivity({
      taskId: id,
      userId: actor,
      action: submittedForReview ? 'submitted_for_review' : movedToDone ? 'completed' : 'moved',
    })
  }
  if (d.priority && d.priority !== before.priority) {
    await logTaskActivity({ taskId: id, userId: actor, action: 'priority_changed', meta: { from: before.priority, to: d.priority } })
  }
  if (d.dueDate !== undefined) {
    await logTaskActivity({ taskId: id, userId: actor, action: 'due_changed', meta: { to: d.dueDate } })
  }

  // Only ping people who weren't already on the task.
  if (validAssignees) {
    const had = new Set(before.assignees.map(a => a.employeeId))
    const added = validAssignees.map(a => a.id).filter(empId => !had.has(empId))
    if (added.length) {
      await logTaskActivity({ taskId: id, userId: actor, action: 'assigned', meta: { employeeIds: added } })
      await notifyTaskAssigned({
        companyId,
        employeeIds: added,
        actorUserId: actor,
        taskKey: taskKey(before.number),
        taskTitle: d.title ?? before.title,
        taskId: id,
      })
    }
  }

  const task = await prisma.task.findUnique({ where: { id }, include: TASK_LIST_INCLUDE })
  return NextResponse.json({ task: task ? shapeTask(task) : null, submittedForReview })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await guardTask(req, id, 'edit')
  if (!guard.ok) return guard.response

  await prisma.task.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
