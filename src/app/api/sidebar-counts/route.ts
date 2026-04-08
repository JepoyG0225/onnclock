import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const [pendingDtr, pendingLeaves] = await Promise.all([
    prisma.dTRRecord.count({
      where: {
        employee: { companyId: ctx.companyId },
        timeOut: { not: null },
        approvedBy: null,
      },
    }),
    prisma.leaveRequest.count({
      where: {
        employee: { companyId: ctx.companyId },
        status: 'PENDING',
      },
    }),
  ])

  return NextResponse.json({ pendingDtr, pendingLeaves })
}
