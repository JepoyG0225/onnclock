/**
 * Access control for Task Management.
 *
 * With projects gone there is no per-container membership to resolve — access
 * is decided by the company-level permission pair:
 *
 *   tasks:read    — open the module, see the company's tasks
 *   tasks:manage  — administer statuses and labels, edit anyone's task,
 *                   log time on someone else's behalf, delete tasks
 *
 * Everyone with `tasks:read` may create tasks and edit the ones they're
 * assigned to or created. That keeps the module usable by rank-and-file staff
 * without handing them administrative control.
 */
import { prisma } from '@/lib/prisma'
import type { AuthContext } from '@/lib/api-auth'
import { WORKING_DAYS_PER_YEAR } from '@/lib/constants'

/** Roles that implicitly administer the whole module. */
export const TASK_ADMIN_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'] as const

export interface TaskActor {
  userId: string
  companyId: string
  role: string
  /** The Employee row behind this login, if any. Null for admin-only logins. */
  employeeId: string | null
  /** Set for DEPARTMENT_HEAD. */
  managedDepartmentId: string | null
  isCompanyAdmin: boolean
  /** Holds tasks:manage (or is an admin role). */
  canManage: boolean
}

export async function resolveTaskActor(
  ctx: AuthContext,
  companyId: string,
  hasManagePermission: boolean,
): Promise<TaskActor> {
  const isCompanyAdmin =
    (TASK_ADMIN_ROLES as readonly string[]).includes(ctx.role) || ctx.actorRole === 'SUPER_ADMIN'

  let employeeId: string | null = null
  try {
    const emp = await prisma.employee.findFirst({
      where: { companyId, userId: ctx.userId },
      select: { id: true },
    })
    employeeId = emp?.id ?? null
  } catch {
    employeeId = null
  }

  return {
    userId: ctx.userId,
    companyId,
    role: ctx.role,
    employeeId,
    managedDepartmentId: ctx.managedDepartmentId ?? null,
    isCompanyAdmin,
    canManage: isCompanyAdmin || hasManagePermission,
  }
}

/**
 * Whether `actor` may modify a specific task.
 *
 * Managers may edit anything. Everyone else may edit a task they created or
 * are assigned to — enough to do their own work, not enough to rewrite
 * somebody else's.
 */
export function canEditTask(
  actor: TaskActor,
  task: { createdByUserId: string | null; assignees: Array<{ employeeId: string }> },
): boolean {
  if (actor.canManage) return true
  if (task.createdByUserId && task.createdByUserId === actor.userId) return true
  if (actor.employeeId && task.assignees.some(a => a.employeeId === actor.employeeId)) return true
  return false
}

/** Default statuses seeded the first time a company opens the module. */
export const DEFAULT_TASK_STATUSES: Array<{
  name: string
  color: string
  category: 'TODO' | 'IN_PROGRESS' | 'DONE'
  isDefault: boolean
}> = [
  { name: 'Backlog',     color: '#94a3b8', category: 'TODO',        isDefault: false },
  { name: 'To Do',       color: '#3b82f6', category: 'TODO',        isDefault: true  },
  { name: 'In Progress', color: '#f59e0b', category: 'IN_PROGRESS', isDefault: false },
  { name: 'Blocked',     color: '#ef4444', category: 'IN_PROGRESS', isDefault: false },
  { name: 'In Review',   color: '#8b5cf6', category: 'IN_PROGRESS', isDefault: false },
  { name: 'Done',        color: '#10b981', category: 'DONE',        isDefault: false },
]

/**
 * Return the company's statuses, seeding the defaults on first use.
 *
 * Seeding lazily (rather than at signup) means every existing company gets
 * them the moment someone opens the module, with no backfill migration.
 */
export async function ensureTaskStatuses(companyId: string) {
  const existing = await prisma.taskStatus.findMany({
    where: { companyId },
    orderBy: { order: 'asc' },
  })
  if (existing.length > 0) return existing

  try {
    await prisma.taskStatus.createMany({
      data: DEFAULT_TASK_STATUSES.map((s, i) => ({
        companyId,
        name: s.name,
        color: s.color,
        category: s.category,
        isDefault: s.isDefault,
        order: i,
      })),
      skipDuplicates: true,
    })
  } catch (err) {
    // A concurrent first-open may have seeded them between our read and write;
    // the unique(companyId, name) constraint makes that harmless.
    console.error('[tasks] status seeding raced or failed', { companyId, err })
  }

  return prisma.taskStatus.findMany({ where: { companyId }, orderBy: { order: 'asc' } })
}

/** The status new tasks land in: the flagged default, else the first one. */
export async function defaultStatusId(companyId: string): Promise<string | null> {
  const statuses = await ensureTaskStatuses(companyId)
  return statuses.find(s => s.isDefault)?.id ?? statuses[0]?.id ?? null
}

/**
 * Best-effort hourly rate used to price logged time.
 *
 * REPORTING estimate only — payroll has its own engine
 * (src/lib/payroll/engine.ts) and this must never feed into it.
 */
export function estimateHourlyRate(
  employee: { rateType: string; basicSalary: unknown; dailyRate: unknown; hourlyRate: unknown },
  workHoursPerDay: number,
): number {
  const hours = workHoursPerDay > 0 ? workHoursPerDay : 8
  const num = (v: unknown): number => {
    if (v === null || v === undefined) return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const hourly = num(employee.hourlyRate)
  if (hourly > 0) return hourly

  const daily = num(employee.dailyRate)
  if (daily > 0) return daily / hours

  const basic = num(employee.basicSalary)
  if (basic <= 0) return 0

  switch (employee.rateType) {
    case 'HOURLY': return basic
    case 'DAILY':  return basic / hours
    case 'MONTHLY':
    default:       return (basic * 12) / WORKING_DAYS_PER_YEAR / hours
  }
}

/** Human-readable task key. */
export function taskKey(number: number): string {
  return `TSK-${number}`
}
