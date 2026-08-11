/**
 * Task activity trail + notification fan-out.
 *
 * Both are best-effort in the same spirit as src/lib/notifications.ts: a
 * failure to record history or ring a bell must never fail the mutation the
 * user actually asked for.
 */
import { prisma } from '@/lib/prisma'
import { createNotificationsForUsers } from '@/lib/notifications'
import type { Prisma } from '@prisma/client'

export type TaskAction =
  | 'created'
  | 'renamed'
  | 'moved'
  | 'assigned'
  | 'unassigned'
  | 'priority_changed'
  | 'due_changed'
  | 'completed'
  | 'reopened'
  | 'commented'
  | 'time_logged'
  | 'attached'
  | 'subtask_added'
  | 'deleted'

export async function logTaskActivity(input: {
  taskId: string
  userId?: string | null
  action: TaskAction
  meta?: Prisma.InputJsonValue
}): Promise<void> {
  try {
    await prisma.taskActivity.create({
      data: {
        taskId: input.taskId,
        userId: input.userId ?? null,
        action: input.action,
        ...(input.meta === undefined ? {} : { meta: input.meta }),
      },
    })
  } catch (err) {
    console.error('[projects] activity write failed', { taskId: input.taskId, action: input.action, err })
  }
}

/**
 * Map employee ids to the user ids behind them, skipping employees with no
 * portal login and optionally excluding the actor so nobody is notified about
 * their own action.
 */
export async function userIdsForEmployees(
  employeeIds: string[],
  excludeUserId?: string | null,
): Promise<string[]> {
  if (employeeIds.length === 0) return []
  try {
    const rows = await prisma.employee.findMany({
      where: { id: { in: employeeIds }, userId: { not: null } },
      select: { userId: true },
    })
    const ids = rows
      .map(r => r.userId)
      .filter((id): id is string => Boolean(id))
      .filter(id => id !== excludeUserId)
    return Array.from(new Set(ids))
  } catch {
    return []
  }
}

/** Notify employees that a task was assigned to them. */
export async function notifyTaskAssigned(input: {
  companyId: string
  employeeIds: string[]
  actorUserId: string
  taskKey: string
  taskTitle: string
  taskId: string
}): Promise<void> {
  const userIds = await userIdsForEmployees(input.employeeIds, input.actorUserId)
  if (userIds.length === 0) return
  await createNotificationsForUsers(userIds, {
    companyId: input.companyId,
    type: 'TASK_ASSIGNED',
    title: `Assigned to ${input.taskKey}`,
    body: input.taskTitle,
    link: `/tasks?task=${input.taskId}`,
  })
}

/** Notify a task's assignees that somebody commented on it. */
export async function notifyTaskCommented(input: {
  companyId: string
  taskId: string
  actorUserId: string
  actorName: string
  taskKey: string
  taskTitle: string
  /** Users already notified another way (e.g. an @mention) — skip them. */
  skipUserIds?: string[]
}): Promise<void> {
  try {
    const assignees = await prisma.taskAssignee.findMany({
      where: { taskId: input.taskId },
      select: { employeeId: true },
    })
    const skip = new Set(input.skipUserIds ?? [])
    const userIds = (
      await userIdsForEmployees(assignees.map(a => a.employeeId), input.actorUserId)
    ).filter(id => !skip.has(id))
    if (userIds.length === 0) return
    await createNotificationsForUsers(userIds, {
      companyId: input.companyId,
      type: 'TASK_COMMENTED',
      title: `${input.actorName} commented on ${input.taskKey}`,
      body: input.taskTitle,
      link: `/tasks?task=${input.taskId}`,
    })
  } catch (err) {
    console.error('[projects] comment notification failed', { taskId: input.taskId, err })
  }
}

/**
 * Notify users @mentioned in a comment.
 *
 * Mentioned ids are validated against the company's user list before any
 * notification is written — the ids arrive inside user-authored comment text,
 * so a hand-crafted body must not be able to ping users in another tenant.
 * Returns the ids that survived validation, for storing on the comment.
 */
export async function notifyTaskMentions(input: {
  companyId: string
  taskId: string
  userIds: string[]
  actorUserId: string
  actorName: string
  taskKey: string
  taskTitle: string
  excerpt: string
}): Promise<string[]> {
  const candidates = input.userIds.filter(id => id !== input.actorUserId)
  if (candidates.length === 0) return []

  try {
    const valid = await prisma.userCompany.findMany({
      where: { companyId: input.companyId, userId: { in: candidates } },
      select: { userId: true },
    })
    const validIds = Array.from(new Set(valid.map(v => v.userId)))
    if (validIds.length === 0) return []

    await createNotificationsForUsers(validIds, {
      companyId: input.companyId,
      type: 'TASK_MENTIONED',
      title: `${input.actorName} mentioned you on ${input.taskKey}`,
      body: input.excerpt.length > 140 ? `${input.excerpt.slice(0, 137)}…` : input.excerpt,
      link: `/tasks?task=${input.taskId}`,
    })
    return validIds
  } catch (err) {
    console.error('[projects] mention notification failed', { taskId: input.taskId, err })
    return []
  }
}
