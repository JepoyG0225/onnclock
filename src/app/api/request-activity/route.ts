import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildRequestActivity } from '@/lib/request-activity'
import type { RequestActivityEvent } from '@/components/ui/request-activity-feed'

/**
 * Unified activity-feed endpoint.
 *
 *   GET /api/request-activity?type=LEAVE&id=<requestId>
 *
 * Returns the structured RequestActivityEvent[] for any request type
 * in the system. Lets every detail page render the same activity
 * widget without each page needing its own fetch shape. Always
 * scopes by ctx.companyId so cross-company snooping is impossible.
 *
 * Supported types (mirrors the approvalTrail-carrying models in
 * prisma/schema.prisma):
 *   LEAVE, OVERTIME, CASH_ADVANCE, BUDGET, TIME_CORRECTION, PAYROLL
 */
type RequestType = 'LEAVE' | 'OVERTIME' | 'CASH_ADVANCE' | 'BUDGET' | 'TIME_CORRECTION' | 'PAYROLL'

const TYPE_SET: Set<RequestType> = new Set([
  'LEAVE', 'OVERTIME', 'CASH_ADVANCE', 'BUDGET', 'TIME_CORRECTION', 'PAYROLL',
])

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  const { searchParams } = new URL(req.url)
  const type = String(searchParams.get('type') ?? '').toUpperCase() as RequestType
  const id = searchParams.get('id') ?? ''

  if (!TYPE_SET.has(type)) {
    return NextResponse.json({ error: 'Invalid request type' }, { status: 400 })
  }
  if (!id) {
    return NextResponse.json({ error: 'Missing request id' }, { status: 400 })
  }

  try {
    const events = await resolveActivity(type, id, ctx.companyId)
    return NextResponse.json(
      { events },
      { headers: { 'Cache-Control': 'private, max-age=10' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    console.error('[/api/request-activity] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── Per-type resolution ───────────────────────────────────────────────
// Each branch reads the request + its creator + the trail, then hands
// it to buildRequestActivity. We keep these branches small so the
// schema-specific field names (employeeId vs requesterUserId, etc.)
// don't leak into the shared helper.
async function resolveActivity(
  type: RequestType,
  id: string,
  companyId: string,
): Promise<RequestActivityEvent[]> {
  switch (type) {
    case 'LEAVE': {
      const r = await prisma.leaveRequest.findFirst({
        where: { id, employee: { companyId } },
        select: {
          createdAt: true,
          approvalTrail: true,
          employee: {
            select: {
              firstName: true,
              lastName: true,
              userId: true,
              position: { select: { title: true } },
            },
          },
        },
      })
      if (!r) throw new Error('NOT_FOUND')
      return buildRequestActivity({
        submission: {
          actorId: r.employee.userId,
          actorName: `${r.employee.firstName} ${r.employee.lastName}`,
          actorRole: r.employee.position?.title ?? 'Employee',
          at: r.createdAt,
        },
        trail: r.approvalTrail,
        companyId,
      })
    }
    case 'OVERTIME': {
      const r = await prisma.overtimeRequest.findFirst({
        where: { id, companyId },
        select: {
          createdAt: true,
          approvalTrail: true,
          employee: {
            select: {
              firstName: true,
              lastName: true,
              userId: true,
              position: { select: { title: true } },
            },
          },
        },
      })
      if (!r) throw new Error('NOT_FOUND')
      return buildRequestActivity({
        submission: {
          actorId: r.employee.userId,
          actorName: `${r.employee.firstName} ${r.employee.lastName}`,
          actorRole: r.employee.position?.title ?? 'Employee',
          at: r.createdAt,
        },
        trail: r.approvalTrail,
        companyId,
      })
    }
    case 'CASH_ADVANCE': {
      const r = await prisma.cashAdvanceRequest.findFirst({
        where: { id, companyId },
        select: {
          createdAt: true,
          approvalTrail: true,
          employee: {
            select: {
              firstName: true,
              lastName: true,
              userId: true,
              position: { select: { title: true } },
            },
          },
        },
      })
      if (!r) throw new Error('NOT_FOUND')
      return buildRequestActivity({
        submission: {
          actorId: r.employee.userId,
          actorName: `${r.employee.firstName} ${r.employee.lastName}`,
          actorRole: r.employee.position?.title ?? 'Employee',
          at: r.createdAt,
        },
        trail: r.approvalTrail,
        companyId,
      })
    }
    case 'BUDGET': {
      const r = await prisma.budgetRequisition.findFirst({
        where: { id, companyId },
        select: {
          createdAt: true,
          approvalTrail: true,
          employee: {
            select: {
              firstName: true,
              lastName: true,
              userId: true,
              position: { select: { title: true } },
            },
          },
        },
      })
      if (!r) throw new Error('NOT_FOUND')
      return buildRequestActivity({
        submission: {
          actorId: r.employee.userId,
          actorName: `${r.employee.firstName} ${r.employee.lastName}`,
          actorRole: r.employee.position?.title ?? 'Employee',
          at: r.createdAt,
        },
        trail: r.approvalTrail,
        companyId,
      })
    }
    case 'TIME_CORRECTION': {
      const r = await prisma.timeEntryCorrection.findFirst({
        where: { id, companyId },
        select: {
          createdAt: true,
          approvalTrail: true,
          employee: {
            select: {
              firstName: true,
              lastName: true,
              userId: true,
              position: { select: { title: true } },
            },
          },
        },
      })
      if (!r) throw new Error('NOT_FOUND')
      return buildRequestActivity({
        submission: {
          actorId: r.employee.userId,
          actorName: `${r.employee.firstName} ${r.employee.lastName}`,
          actorRole: r.employee.position?.title ?? 'Employee',
          at: r.createdAt,
        },
        trail: r.approvalTrail,
        companyId,
      })
    }
    case 'PAYROLL': {
      const r = await prisma.payrollRun.findFirst({
        where: { id, companyId },
        select: {
          createdAt: true,
          approvalTrail: true,
          createdBy: true,
        },
      })
      if (!r) throw new Error('NOT_FOUND')
      // Resolve the creator's name out-of-band
      const creator = await prisma.user.findUnique({
        where: { id: r.createdBy },
        select: { name: true, email: true },
      })
      return buildRequestActivity({
        submission: {
          actorId: r.createdBy,
          actorName: creator?.name ?? creator?.email ?? 'Payroll Officer',
          actorRole: 'Payroll Officer',
          at: r.createdAt,
        },
        trail: r.approvalTrail,
        companyId,
      })
    }
  }
}
