/**
 * Configurable approval-workflow engine (v3).
 *
 * A company defines, per request type (LEAVE, OVERTIME, CASH_ADVANCE, BUDGET,
 * TIME_CORRECTION), an ordered list of steps. Each step is either an APPROVAL
 * (a human must sign off) or a NOTIFY (an email / in-app message fires
 * automatically). Any step may carry a `conditions` guard that is evaluated
 * against the request's field values — steps whose guard is false are dropped,
 * so the live chain is data-driven ("if amount > 50000, add the CFO").
 *
 * This module is the single source of truth that every request handler calls.
 * It deliberately knows nothing about leave balances / loans / DTR rows — the
 * caller runs those side effects when `isFinal` comes back true.
 */
import { prisma } from '@/lib/prisma'

// ── Types ──────────────────────────────────────────────────────────────────

export type ApprovalRequestType =
  | 'LEAVE'
  | 'OVERTIME'
  | 'CASH_ADVANCE'
  | 'BUDGET'
  | 'TIME_CORRECTION'
  | 'PAYROLL'
  | 'ATTENDANCE_REVIEW'

export type StepType = 'APPROVAL' | 'NOTIFY'
export type ApproverType = 'SPECIFIC_USER' | 'ROLE' | 'DEPARTMENT_HEAD'
export type NotifyTarget = 'REQUESTER' | 'DEPARTMENT_HEAD' | 'SPECIFIC_USER' | 'ROLE'
export type NotifyChannel = 'EMAIL' | 'IN_APP' | 'BOTH'

export type ConditionOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'

export interface ConditionRule {
  field: string
  op: ConditionOp
  value: unknown
}

export interface ConditionGroup {
  match: 'ALL' | 'ANY'
  rules: ConditionRule[]
}

/** A snapshot of the request's field values used to evaluate condition guards. */
export type RequestFacts = Record<string, unknown>

interface RawStep {
  id: string
  order: number
  stepType: string
  conditions: unknown
  approverType: string | null
  approverUserId: string | null
  approverRole: string | null
  notifyTarget: string | null
  notifyUserId: string | null
  notifyRole: string | null
  notifyChannel: string | null
  messageTitle: string | null
  messageBody: string | null
}

interface RawWorkflow {
  id: string
  companyId: string
  type: string
  departmentId: string | null
  steps: RawStep[]
}

// ── Condition evaluation ─────────────────────────────────────────────────────

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
  // Prisma Decimal exposes toNumber()
  if (v && typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    try { return (v as { toNumber: () => number }).toNumber() } catch { return null }
  }
  return null
}

function evalRule(rule: ConditionRule, facts: RequestFacts): boolean {
  const actual = facts[rule.field]
  const expected = rule.value
  switch (rule.op) {
    case 'eq': return String(actual) === String(expected)
    case 'ne': return String(actual) !== String(expected)
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = toNumber(actual)
      const b = toNumber(expected)
      if (a === null || b === null) return false
      if (rule.op === 'gt') return a > b
      if (rule.op === 'gte') return a >= b
      if (rule.op === 'lt') return a < b
      return a <= b
    }
    case 'in': {
      const list = Array.isArray(expected) ? expected : String(expected).split(',').map(s => s.trim())
      return list.map(String).includes(String(actual))
    }
    case 'contains':
      return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase())
    default:
      return false
  }
}

/** Empty / missing guard ⇒ the step always applies. */
export function evaluateConditions(conditions: unknown, facts: RequestFacts): boolean {
  if (!conditions || typeof conditions !== 'object') return true
  const group = conditions as ConditionGroup
  if (!Array.isArray(group.rules) || group.rules.length === 0) return true
  if (group.match === 'ANY') return group.rules.some(r => evalRule(r, facts))
  return group.rules.every(r => evalRule(r, facts)) // default ALL
}

// ── Workflow resolution ──────────────────────────────────────────────────────

/**
 * Find the workflow that governs a request: the department-scoped one if the
 * requester's department has its own, otherwise the company-wide default
 * (departmentId = null). Returns null if neither exists (caller falls back to
 * legacy behaviour / single-step approval).
 */
export async function resolveWorkflow(opts: {
  companyId: string
  type: ApprovalRequestType
  departmentId?: string | null
}): Promise<RawWorkflow | null> {
  const { companyId, type, departmentId } = opts

  let candidates: RawWorkflow[]
  try {
    candidates = (await prisma.approvalWorkflow.findMany({
      where: {
        companyId,
        type,
        isActive: true,
        ...(departmentId ? { OR: [{ departmentId }, { departmentId: null }] } : { departmentId: null }),
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    })) as unknown as RawWorkflow[]
  } catch (err) {
    // Table not migrated yet (P2021) or transient error — fall back to legacy
    // single-chain approval by signalling "no workflow configured".
    console.error('[approvals/engine] resolveWorkflow query failed — falling back to legacy', err)
    return null
  }

  if (candidates.length === 0) return null
  // Prefer the department-specific workflow over the company default.
  const deptMatch = departmentId ? candidates.find(w => w.departmentId === departmentId) : undefined
  const chosen = deptMatch ?? candidates.find(w => w.departmentId === null)
  if (!chosen) return null
  return chosen as unknown as RawWorkflow
}

// ── Live plan ────────────────────────────────────────────────────────────────

export interface LiveStep extends RawStep {
  /** index of this step within the live (post-condition) list */
  liveIndex: number
}

export interface ApprovalPlan {
  workflowId: string
  companyId: string
  /** all live steps (APPROVAL + NOTIFY) in order, after condition filtering */
  liveSteps: LiveStep[]
  /** only the APPROVAL steps, in order — this is the chain `approvalLevel` walks */
  approvalSteps: LiveStep[]
}

/**
 * Build the live execution plan for a request: drop steps whose guard fails,
 * then split into the flat ordered list and the approval-only chain.
 */
export function buildPlan(workflow: RawWorkflow, facts: RequestFacts): ApprovalPlan {
  const liveSteps: LiveStep[] = workflow.steps
    .filter(s => evaluateConditions(s.conditions, facts))
    .map((s, i) => ({ ...s, liveIndex: i }))
  const approvalSteps = liveSteps.filter(s => s.stepType === 'APPROVAL')
  return { workflowId: workflow.id, companyId: workflow.companyId, liveSteps, approvalSteps }
}

// ── Approver resolution & authorization ──────────────────────────────────────

/**
 * Resolve the set of user IDs allowed to act on an APPROVAL step. SPECIFIC_USER
 * yields one id; DEPARTMENT_HEAD resolves the head of the requester's
 * department; ROLE yields every active user holding that role in the company.
 */
export async function resolveApprovers(
  step: RawStep,
  ctx: { companyId: string; requesterDepartmentId?: string | null; requesterEmployeeId?: string | null },
): Promise<string[]> {
  if (step.approverType === 'SPECIFIC_USER') {
    return step.approverUserId ? [step.approverUserId] : []
  }
  if (step.approverType === 'DEPARTMENT_HEAD') {
    // "Department head (of requester)" resolves to the requester's Reports-To
    // manager (Employee.managerId → that manager's linked user account).
    if (ctx.requesterEmployeeId) {
      const requester = await prisma.employee.findUnique({
        where: { id: ctx.requesterEmployeeId },
        select: { manager: { select: { userId: true } } },
      })
      const managerUserId = requester?.manager?.userId
      if (managerUserId) return [managerUserId]
    }
    // Fallback when there's no Reports-To set, the manager has no user account,
    // or the request isn't tied to one employee (e.g. company-wide PAYROLL):
    // use the department-head role for the requester's department, otherwise any
    // department head in the company.
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
  if (step.approverType === 'ROLE' && step.approverRole) {
    const holders = await prisma.userCompany.findMany({
      where: { companyId: ctx.companyId, role: step.approverRole as never, isActive: true },
      select: { userId: true },
    })
    return holders.map(h => h.userId)
  }
  return []
}

export interface AdvanceResult {
  /** true when there is no approval chain configured at all */
  noChain: boolean
  /** the actor is allowed to act at the current level */
  authorized: boolean
  /** 1-based level after this approve action */
  nextLevel: number
  /** approving at this level finishes the chain */
  isFinal: boolean
  /** the live approval step the actor is acting on (null when noChain) */
  currentStep: LiveStep | null
}

/**
 * The generalized version of the leave route's chain walk. Given the plan, the
 * request's current approvalLevel and the acting user, decide whether the
 * action is authorized and whether it is the final approval.
 */
export async function authorizeAdvance(opts: {
  plan: ApprovalPlan
  currentLevel: number
  actorUserId: string
  requesterDepartmentId?: string | null
  requesterEmployeeId?: string | null
}): Promise<AdvanceResult> {
  const { plan, currentLevel, actorUserId, requesterDepartmentId, requesterEmployeeId } = opts
  const maxLevel = plan.approvalSteps.length
  const nextLevel = currentLevel + 1

  if (maxLevel === 0) {
    // No approval steps (e.g. notify-only or empty workflow) — single step to final.
    return { noChain: true, authorized: true, nextLevel, isFinal: true, currentStep: null }
  }

  const currentStep = plan.approvalSteps[nextLevel - 1] ?? null
  if (!currentStep) {
    return { noChain: false, authorized: false, nextLevel, isFinal: false, currentStep: null }
  }

  const allowed = await resolveApprovers(currentStep, {
    companyId: plan.companyId,
    requesterDepartmentId,
    requesterEmployeeId,
  })
  const authorized = allowed.includes(actorUserId)
  const isFinal = nextLevel >= maxLevel
  return { noChain: false, authorized, nextLevel, isFinal, currentStep }
}

export interface TrailEntry {
  level: number
  userId: string
  action: string
  notes: string | null
  at: string
}

export interface ApprovalDecision {
  /** false ⇒ no workflow configured; caller must apply its legacy role gate */
  usedWorkflow: boolean
  /** whether the actor may act at this level (only meaningful when usedWorkflow) */
  authorized: boolean
  /** approving here finishes the chain — caller runs its side effects */
  isFinal: boolean
  /** 1-based level after this action */
  nextLevel: number
  plan: ApprovalPlan | null
  /** the audit-trail entry to append for this action */
  trailEntry: TrailEntry
}

/**
 * One-call helper for the per-resource PATCH handlers (overtime, cash advance,
 * budget, time correction). Resolves the workflow, evaluates conditions, and
 * decides authorization + finality for an approve/reject action. When no
 * workflow exists, `usedWorkflow` is false and the caller falls back to its
 * legacy hardcoded-role gate (so nothing changes for un-configured companies).
 */
export async function evaluateApprovalAction(opts: {
  companyId: string
  type: ApprovalRequestType
  requesterDepartmentId?: string | null
  requesterEmployeeId?: string | null
  facts: RequestFacts
  currentLevel: number
  actorUserId: string
  action: 'approve' | 'reject'
  notes?: string | null
}): Promise<ApprovalDecision> {
  const { companyId, type, requesterDepartmentId, requesterEmployeeId, facts, currentLevel, actorUserId, action, notes } = opts
  const trail = (level: number): TrailEntry => ({
    level,
    userId: actorUserId,
    action,
    notes: notes ?? null,
    at: new Date().toISOString(),
  })

  const workflow = await resolveWorkflow({ companyId, type, departmentId: requesterDepartmentId })
  if (!workflow) {
    return { usedWorkflow: false, authorized: false, isFinal: true, nextLevel: currentLevel + 1, plan: null, trailEntry: trail(currentLevel + 1) }
  }

  const plan = buildPlan(workflow, facts)
  const adv = await authorizeAdvance({ plan, currentLevel, actorUserId, requesterDepartmentId, requesterEmployeeId })
  return {
    usedWorkflow: true,
    authorized: adv.noChain || adv.authorized,
    isFinal: action === 'approve' ? adv.isFinal : true,
    nextLevel: adv.nextLevel,
    plan,
    trailEntry: trail(adv.nextLevel),
  }
}

// ── NOTIFY-step selectors ────────────────────────────────────────────────────
// NOTIFY steps interleave with APPROVAL steps in the flat live list. They fire
// as the workflow pointer passes them: at submission (before the 1st approval),
// and on each approval transition (the notifies sitting between the just-signed
// approval step and the next pending one — or, on the final approval, all the
// trailing notifies).

const notifySteps = (plan: ApprovalPlan) => plan.liveSteps.filter(s => s.stepType === 'NOTIFY')

/** NOTIFY steps that run when the request is first submitted. */
export function notifyStepsOnSubmit(plan: ApprovalPlan): LiveStep[] {
  const firstApproval = plan.approvalSteps[0]
  const cutoff = firstApproval ? firstApproval.liveIndex : Infinity
  return notifySteps(plan).filter(s => s.liveIndex < cutoff)
}

/**
 * NOTIFY steps that run on an approve transition from `fromLevel` to
 * `toLevel` (= fromLevel + 1). When `isFinal`, every trailing notify after the
 * last approval step fires.
 */
export function notifyStepsOnApprove(plan: ApprovalPlan, toLevel: number, isFinal: boolean): LiveStep[] {
  const justSigned = plan.approvalSteps[toLevel - 1]
  if (!justSigned) return []
  const lower = justSigned.liveIndex
  const upper = isFinal ? Infinity : (plan.approvalSteps[toLevel]?.liveIndex ?? Infinity)
  return notifySteps(plan).filter(s => s.liveIndex > lower && s.liveIndex < upper)
}
