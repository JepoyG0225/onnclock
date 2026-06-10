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
  const approveOvertime = !!body.approveOvertime
  // Optional explicit OT picker — when provided, ONLY these ids are
  // approved. Takes precedence over `approveOvertime`. Empty array =
  // approve none.
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
      otApproved = await approveAutoOtByIds({
        companyId,
        ids: overtimeRequestIds,
        approvedById: ctx.userId,
      })
    } else if (approveOvertime && Number(record.overtimeHours ?? 0) > 0) {
      otApproved = await approveAutoOtForDtr({
        companyId,
        employeeId: record.employeeId,
        date: record.date,
        approvedById: ctx.userId,
      })
    }
  }

  logAudit(ctx, action === 'APPROVED' ? 'APPROVE' : 'REJECT', 'DTRRecord', id).catch(() => {})

  return NextResponse.json({ ...updated, otApproved })
}
