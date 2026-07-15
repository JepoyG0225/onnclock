import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

// Reversing an approval is a plain HR action (no workflow chain) — same gate
// as the single-request reversal in [id]/route.ts.
const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

const bodySchema = z.object({
  /** Optional list of specific request IDs. If omitted, reverses ALL approved. */
  ids: z.array(z.string()).optional(),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error' }, { status: 422 })
  }

  const where: Prisma.OvertimeRequestWhereInput = {
    companyId: ctx.companyId,
    status: 'APPROVED',
    ...(parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : {}),
  }

  const approvedRequests = await prisma.overtimeRequest.findMany({
    where,
    select: { id: true },
    take: 500, // Safety cap
  })

  if (approvedRequests.length === 0) {
    return NextResponse.json({ reversed: 0 })
  }

  const ids = approvedRequests.map(r => r.id)

  // Reset each back to PENDING, clearing approval metadata + trail so the
  // request re-enters the approval flow from level 0.
  const result = await prisma.overtimeRequest.updateMany({
    where: { id: { in: ids }, companyId: ctx.companyId, status: 'APPROVED' },
    data: {
      status: 'PENDING',
      approvedById: null,
      approvedAt: null,
      approvalLevel: 0,
      approvalTrail: [] as Prisma.InputJsonValue,
    },
  })

  if (result.count > 0) {
    logAudit(ctx, 'BULK_REVERSE', 'OvertimeRequest', ids[0], {
      description: `Bulk reversed ${result.count} approved overtime request${result.count === 1 ? '' : 's'} back to pending`,
      newValues: { reversedCount: result.count, ids },
    }).catch(() => {})
  }

  return NextResponse.json({ reversed: result.count, total: approvedRequests.length })
}
