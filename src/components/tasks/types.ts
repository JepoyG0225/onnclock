/** Shared client-side shapes for the Task Management UI. */

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type StatusCategory = 'TODO' | 'IN_PROGRESS' | 'DONE'

export interface EmployeeBrief {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
}

export interface LabelBrief {
  id: string
  name: string
  color: string
}

export interface TaskStatus {
  id: string
  name: string
  color: string
  order: number
  category: StatusCategory
  isDefault: boolean
  wipLimit: number | null
}

export interface TaskRow {
  id: string
  number: number
  key: string
  title: string
  description: string | null
  statusId: string
  status: { id: string; name: string; color: string; category: string; order: number }
  parentTaskId: string | null
  priority: Priority
  order: number
  startDate: string | null
  dueDate: string | null
  estimateHours: number | null
  loggedHours: number
  completedAt: string | null
  assignees: EmployeeBrief[]
  labels: LabelBrief[]
  commentCount: number
  subtaskCount: number
  checklistTotal: number
  checklistDone: number
  attachmentCount: number
  updatedAt: string
}

export const PRIORITY_STYLES: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-700 border-slate-200',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200',
  HIGH: 'bg-amber-50 text-amber-700 border-amber-200',
  URGENT: 'bg-red-50 text-red-700 border-red-200',
}

export function initialsOf(e: { firstName: string; lastName: string }): string {
  return `${e.firstName.charAt(0)}${e.lastName.charAt(0)}`.toUpperCase()
}

export function fullName(e: { firstName: string; lastName: string }): string {
  return `${e.firstName} ${e.lastName}`
}

/**
 * Deterministic avatar tint derived from the employee id, so the same person
 * keeps the same colour everywhere without storing one.
 */
export function avatarTint(id: string): string {
  const palette = [
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-purple-100 text-purple-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
    'bg-indigo-100 text-indigo-700',
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

/** Manila-local YYYY-MM-DD for a date-only value, avoiding UTC drift. */
export function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 10)
}

export function formatDueDate(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** True when a due date is in the past (compared in Manila time). */
export function isOverdue(due: string | null, completedAt: string | null): boolean {
  if (!due || completedAt) return false
  const manilaToday = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return due.slice(0, 10) < manilaToday
}
