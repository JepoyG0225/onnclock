/**
 * Request guard shared by every Task Management route.
 *
 * Collapses auth → company scope → beta gate → HRIS-Pro gate → permission
 * resolution into one call, so route handlers stay about their actual work.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest, type AuthContext } from '@/lib/api-auth'
import { requireHrisProOrTrialApi } from '@/lib/hris-pro'
import { hasTaskModuleBetaAccess } from '@/lib/feature-gates'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { resolveTaskActor, canEditTask, type TaskActor } from './access'

export type GuardFailure = { ok: false; response: NextResponse }

export type TaskGuardSuccess = {
  ok: true
  ctx: AuthContext
  companyId: string
  actor: TaskActor
}

/**
 * @param need  'read' for any module access, 'manage' for administrative
 *              actions (statuses, labels, deleting others' tasks).
 */
export async function guardTasks(
  req: NextRequest,
  need: 'read' | 'manage' = 'read',
): Promise<TaskGuardSuccess | GuardFailure> {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return { ok: false, response: error }

  // Beta allow-list. Every task route funnels through here, so this covers
  // the module including direct API calls. 404 rather than 403 — while in
  // beta it shouldn't advertise that it exists.
  if (!hasTaskModuleBetaAccess(ctx.email)) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }

  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return { ok: false, response: NextResponse.json({ error: 'companyId is required' }, { status: 400 }) }
  }

  const gate = await requireHrisProOrTrialApi(companyId)
  if (gate) return { ok: false, response: gate }

  const canRead = await ctxHasPermission(ctx, 'tasks:read')
  const canManage = await ctxHasPermission(ctx, 'tasks:manage')
  if (!canRead && !canManage) {
    return { ok: false, response: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }) }
  }

  const actor = await resolveTaskActor(ctx, companyId, canManage)

  if (need === 'manage' && !actor.canManage) {
    return { ok: false, response: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }) }
  }

  return { ok: true, ctx, companyId, actor }
}

export type SingleTaskGuardSuccess = TaskGuardSuccess & {
  task: { id: string; number: number; title: string; createdByUserId: string | null }
  canEdit: boolean
}

/**
 * As guardTasks, plus the task itself and whether the caller may modify it.
 *
 * A task outside the caller's company returns 404 rather than 403 so task
 * existence isn't leaked across tenants. `need: 'edit'` additionally requires
 * the caller to be a manager, the creator, or an assignee.
 */
export async function guardTask(
  req: NextRequest,
  taskId: string,
  need: 'view' | 'edit' = 'view',
): Promise<SingleTaskGuardSuccess | GuardFailure> {
  const base = await guardTasks(req)
  if (!base.ok) return base

  const task = await prisma.task.findFirst({
    where: { id: taskId, companyId: base.companyId },
    select: {
      id: true,
      number: true,
      title: true,
      createdByUserId: true,
      assignees: { select: { employeeId: true } },
    },
  })
  if (!task) {
    return { ok: false, response: NextResponse.json({ error: 'Task not found' }, { status: 404 }) }
  }

  const canEdit = canEditTask(base.actor, task)
  if (need === 'edit' && !canEdit) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'You can only change tasks you created or are assigned to' },
        { status: 403 },
      ),
    }
  }

  return { ...base, task, canEdit }
}
