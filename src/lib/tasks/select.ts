/**
 * Shared Prisma selection shapes, so board, list, table, calendar, tracker
 * and My Work all render from identical fields.
 *
 * Kept out of route files because Next only allows HTTP handlers and a fixed
 * set of config exports from a `route.ts`.
 */

export const EMPLOYEE_BRIEF_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  employeeNo: true,
} as const

export const TASK_LIST_INCLUDE = {
  status: { select: { id: true, name: true, color: true, category: true, order: true } },
  assignees: { select: { employee: { select: EMPLOYEE_BRIEF_SELECT } } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
  _count: { select: { comments: true, subtasks: true, checklist: true, attachments: true } },
} as const

/** Row shape the UI consumes. Keep in sync with `shapeTask` below. */
export interface TaskListRow {
  id: string
  number: number
  key: string
  title: string
  description: string | null
  statusId: string
  status: { id: string; name: string; color: string; category: string; order: number }
  parentTaskId: string | null
  priority: string
  order: number
  startDate: Date | null
  dueDate: Date | null
  estimateHours: number | null
  completedAt: Date | null
  assignees: Array<{ id: string; firstName: string; lastName: string; employeeNo: string }>
  labels: Array<{ id: string; name: string; color: string }>
  commentCount: number
  subtaskCount: number
  checklistTotal: number
  attachmentCount: number
  updatedAt: Date
}

type RawTask = {
  id: string
  number: number
  title: string
  description: string | null
  statusId: string
  status: { id: string; name: string; color: string; category: string; order: number }
  parentTaskId: string | null
  priority: string
  order: number
  startDate: Date | null
  dueDate: Date | null
  estimateHours: unknown
  completedAt: Date | null
  updatedAt: Date
  assignees: Array<{ employee: { id: string; firstName: string; lastName: string; employeeNo: string } }>
  labels: Array<{ label: { id: string; name: string; color: string } }>
  _count: { comments: number; subtasks: number; checklist: number; attachments: number }
}

/** Flatten a Prisma task into the shape every view renders from. */
export function shapeTask(t: RawTask): TaskListRow {
  return {
    id: t.id,
    number: t.number,
    key: `TSK-${t.number}`,
    title: t.title,
    description: t.description,
    statusId: t.statusId,
    status: t.status,
    parentTaskId: t.parentTaskId,
    priority: t.priority,
    order: t.order,
    startDate: t.startDate,
    dueDate: t.dueDate,
    estimateHours: t.estimateHours === null || t.estimateHours === undefined ? null : Number(t.estimateHours),
    completedAt: t.completedAt,
    assignees: t.assignees.map(a => a.employee),
    labels: t.labels.map(l => l.label),
    commentCount: t._count.comments,
    subtaskCount: t._count.subtasks,
    checklistTotal: t._count.checklist,
    attachmentCount: t._count.attachments,
    updatedAt: t.updatedAt,
  }
}
