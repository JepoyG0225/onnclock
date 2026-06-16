import { prisma } from '@/lib/prisma'
import type { RequestActivityEvent, RequestActivityEventType } from '@/components/ui/request-activity-feed'

/**
 * Resolve the structured activity timeline for a single request.
 *
 * Works across all request types in the system that follow the same
 * approvalTrail JSON convention (leave, overtime, cash advance, budget
 * requisition, time correction, payroll runs, etc.). Input:
 *
 *   • submission        — who created the request + when
 *   • trail             — raw approvalTrail JSON array
 *   • companyId         — for scoped user/employee lookups
 *   • includePending    — synthesize "Pending: <next approver>" placeholders
 *                          for workflow steps not yet reached (optional)
 *
 * Returns an ordered array of RequestActivityEvent ready to feed into
 * <RequestActivityFeed>. All user IDs in the trail get resolved into
 * display names + email in a SINGLE batched query so this scales to
 * trails with many levels without N+1 hops.
 */
export interface BuildRequestActivityInput {
  submission: {
    actorId: string | null
    actorName: string
    actorRole?: string | null
    at: Date | string
  }
  /**
   * Raw approvalTrail array from the request. Each entry is the shape
   * produced by every approve/reject route in the system:
   *   { level, userId, action, notes, at }
   */
  trail: unknown
  companyId: string
  /**
   * When provided, appends one "pending" event per workflow level that
   * the request hasn't reached yet. The plan object usually comes from
   * the approval engine's resolveWorkflow + buildPlan flow.
   */
  pendingApprovers?: Array<{
    level: number
    actorName: string
    actorRole?: string | null
    levelLabel?: string
  }>
}

type TrailEntry = {
  level?: number
  userId?: string
  action?: string
  notes?: string | null
  at?: string
}

function asTrailEntries(raw: unknown): TrailEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((e): e is TrailEntry => !!e && typeof e === 'object')
}

function actionToEventType(action: string | undefined): RequestActivityEventType {
  const a = (action ?? '').toLowerCase()
  if (a === 'approve' || a === 'approved') return 'approve'
  if (a === 'reject' || a === 'rejected') return 'reject'
  if (a === 'comment') return 'comment'
  return 'approve' // sensible default for unknown actions
}

/**
 * Server-side: build the activity feed events for one request.
 */
export async function buildRequestActivity(
  input: BuildRequestActivityInput,
): Promise<RequestActivityEvent[]> {
  const events: RequestActivityEvent[] = []

  // ── 1. Synthesized submission event ────────────────────────────────
  events.push({
    type: 'submit',
    actorName: input.submission.actorName,
    actorRole: input.submission.actorRole ?? undefined,
    at: typeof input.submission.at === 'string' ? input.submission.at : input.submission.at.toISOString(),
  })

  // ── 2. Trail entries — resolve user names in one batched query ─────
  const entries = asTrailEntries(input.trail)
  if (entries.length > 0) {
    const uniqueUserIds = Array.from(
      new Set(entries.map(e => e.userId).filter((id): id is string => !!id)),
    )

    const users = uniqueUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: uniqueUserIds } },
          select: {
            id: true,
            name: true,
            email: true,
            companies: {
              where: { companyId: input.companyId },
              select: { role: true },
              take: 1,
            },
          },
        })
      : []

    const userMap = new Map(users.map(u => [u.id, u]))

    for (const entry of entries) {
      const user = entry.userId ? userMap.get(entry.userId) : undefined
      const actorName = user?.name ?? user?.email ?? 'Unknown user'
      const actorRole = formatRole(user?.companies?.[0]?.role)

      events.push({
        type: actionToEventType(entry.action),
        actorName,
        actorRole,
        at: entry.at ?? new Date().toISOString(),
        level: typeof entry.level === 'number' ? entry.level : undefined,
        notes: entry.notes ?? null,
      })
    }
  }

  // ── 3. Optional pending placeholders ───────────────────────────────
  if (input.pendingApprovers && input.pendingApprovers.length > 0) {
    for (const p of input.pendingApprovers) {
      events.push({
        type: 'pending',
        actorName: p.actorName,
        actorRole: p.actorRole ?? undefined,
        at: '',
        level: p.level,
        levelLabel: p.levelLabel,
        verb: 'is awaiting approval',
      })
    }
  }

  return events
}

function formatRole(role: string | null | undefined): string | undefined {
  if (!role) return undefined
  // SUPER_ADMIN → Super Admin, HR_MANAGER → Hr Manager (close enough)
  return role
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
