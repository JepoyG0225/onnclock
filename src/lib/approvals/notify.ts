/**
 * Dispatch for the approval engine's NOTIFY steps and the built-in
 * "it's your turn" / decision notifications. Resolves a step's recipients,
 * renders its message with the request's template variables, and fans out to
 * in-app notifications and/or email. Everything here is best-effort — a failure
 * is logged but never thrown, so the approval action itself can't be blocked.
 */
import { prisma } from '@/lib/prisma'
import { createNotificationsForUsers, userIdForEmployee } from '@/lib/notifications'
import { sendCompanyEmail } from '@/lib/mailer'
import { resolveApprovers, notifyStepsOnApprove, type LiveStep, type ApprovalPlan } from './engine'

export interface NotifyContext {
  companyId: string
  requesterEmployeeId: string
  requesterDepartmentId?: string | null
  link?: string | null
  /** template variables substituted into messageTitle/messageBody as {name} */
  vars?: Record<string, string>
}

function render(template: string | null | undefined, vars: Record<string, string> = {}): string {
  if (!template) return ''
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

async function resolveRecipientUserIds(step: LiveStep, ctx: NotifyContext): Promise<string[]> {
  switch (step.notifyTarget) {
    case 'REQUESTER': {
      const uid = await userIdForEmployee(ctx.requesterEmployeeId)
      return uid ? [uid] : []
    }
    case 'SPECIFIC_USER':
      return step.notifyUserId ? [step.notifyUserId] : []
    case 'DEPARTMENT_HEAD': {
      // Mirror the approver resolution: "department head" = the requester's
      // Reports-To manager, falling back to the managed-department head(s).
      if (ctx.requesterEmployeeId) {
        const requester = await prisma.employee.findUnique({
          where: { id: ctx.requesterEmployeeId },
          select: { manager: { select: { userId: true } } },
        })
        const managerUserId = requester?.manager?.userId
        if (managerUserId) return [managerUserId]
      }
      const heads = await prisma.userCompany.findMany({
        where: {
          companyId: ctx.companyId,
          role: 'DEPARTMENT_HEAD',
          isActive: true,
          ...(ctx.requesterDepartmentId ? { managedDepartmentId: ctx.requesterDepartmentId } : {}),
        },
        select: { userId: true },
      })
      return heads.map(h => h.userId)
    }
    case 'ROLE': {
      if (!step.notifyRole) return []
      const holders = await prisma.userCompany.findMany({
        where: { companyId: ctx.companyId, role: step.notifyRole as never, isActive: true },
        select: { userId: true },
      })
      return holders.map(h => h.userId)
    }
    default:
      return []
  }
}

async function emailsForUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return []
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { email: true },
  })
  return users.map(u => u.email).filter((e): e is string => !!e)
}

/** Fire a single NOTIFY step. */
export async function dispatchNotifyStep(step: LiveStep, ctx: NotifyContext): Promise<void> {
  try {
    const userIds = await resolveRecipientUserIds(step, ctx)
    if (userIds.length === 0) return

    const title = render(step.messageTitle, ctx.vars) || 'Approval workflow update'
    const body = render(step.messageBody, ctx.vars)
    const channel = step.notifyChannel ?? 'IN_APP'

    if (channel === 'IN_APP' || channel === 'BOTH') {
      await createNotificationsForUsers(userIds, {
        companyId: ctx.companyId,
        type: 'GENERIC',
        title,
        body: body || null,
        link: ctx.link ?? null,
      })
    }
    if (channel === 'EMAIL' || channel === 'BOTH') {
      const to = await emailsForUsers(userIds)
      if (to.length > 0) {
        await sendCompanyEmail({ companyId: ctx.companyId, to, subject: title, body })
      }
    }
  } catch (err) {
    console.error('[approvals/notify] dispatch failed', { stepId: step.id, err })
  }
}

/** Fire many NOTIFY steps in sequence. */
export async function dispatchNotifySteps(steps: LiveStep[], ctx: NotifyContext): Promise<void> {
  for (const step of steps) await dispatchNotifyStep(step, ctx)
}

/**
 * Convenience for approve handlers: fire the transition's NOTIFY steps and, when
 * the chain continues, ping the next approver. Best-effort — never throws.
 */
export async function notifyAfterApprove(opts: {
  plan: ApprovalPlan
  nextLevel: number
  isFinal: boolean
  ctx: NotifyContext
  nextApproverTitle: string
  nextApproverBody: string
}): Promise<void> {
  const { plan, nextLevel, isFinal, ctx } = opts
  try {
    await dispatchNotifySteps(notifyStepsOnApprove(plan, nextLevel, isFinal), ctx)
    if (isFinal) return
    const nextStep = plan.approvalSteps[nextLevel]
    if (!nextStep) return
    const approvers = await resolveApprovers(nextStep, {
      companyId: ctx.companyId,
      requesterDepartmentId: ctx.requesterDepartmentId,
    })
    if (approvers.length > 0) {
      await createNotificationsForUsers(approvers, {
        companyId: ctx.companyId,
        type: 'GENERIC',
        title: opts.nextApproverTitle,
        body: opts.nextApproverBody,
        link: ctx.link ?? null,
      })
    }
  } catch (err) {
    console.error('[approvals/notify] notifyAfterApprove failed', err)
  }
}
