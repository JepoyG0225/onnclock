import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { isOvertimeEnabledForCompany, approveAutoOtForDtr, approveAutoOtByIds } from '@/lib/overtime-requests'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const body = await req.json()
  const action = body.action as 'APPROVED' | 'REJECTED'
  // Optional explicit OT picker — when provided, ONLY these ids are
  // approved. Empty array = approve none ("approve regular hours only").
  // When omitted entirely, the default-approve path below approves the
  // DTR's linked auto-OT so the timesheet and OT requests stay in sync.
  const overtimeRequestIds: string[] | undefined = Array.isArray(body.overtimeRequestIds)
    ? body.overtimeRequestIds
    : undefined

  const record = await prisma.dTRRecord.findFirst({
    where: { id, employee: { companyId } },
  })
  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

  const updated = await prisma.dTRRecord.update({
    where: { id },
    data: action === 'APPROVED'
      ? { approvedBy: ctx.userId }
      : { approvedBy: null, remarks: record.remarks ?? 'REJECTED' },
  })

  // Optionally approve the linked auto-OT request, but only if OT pay is
  // actually enabled in payroll settings — otherwise the hours wouldn't be
  // counted anyway and approving them would be misleading.
  let otApproved = 0
  if (action === 'APPROVED' && await isOvertimeEnabledForCompany(companyId)) {
    if (overtimeRequestIds !== undefined) {
      // Explicit picker (empty array = "approve regular hours only" opt-out).
      otApproved = await approveAutoOtByIds({
        companyId,
        ids: overtimeRequestIds,
        approvedById: ctx.userId,
      })
    } else {
      // Default approve: keep the timesheet and its OT in sync — approve any
      // PENDING auto-OT request for this DTR's day so the approved hours are
      // actually paid in payroll. (`approveOvertime` is still accepted from
      // legacy clients but no longer required.)
      otApproved = await approveAutoOtForDtr({
        companyId,
        employeeId: record.employeeId,
        date: record.date,
        approvedById: ctx.userId,
      })
    }
  }

  logAudit(ctx, action === 'APPROVED' ? 'APPROVE' : 'REJECT', 'DTRRecord', id, {
    description: `${action === 'APPROVED' ? 'Approved' : 'Rejected'} DTR record for ${record.date.toISOString().slice(0, 10)}`,
  }).catch(() => {})

  return NextResponse.json({ ...updated, otApproved })
}
