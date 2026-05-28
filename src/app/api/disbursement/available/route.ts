import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { checkHrisProAccess } from '@/lib/feature-gates'

/**
 * GET /api/disbursement/available
 * Returns payroll runs that are APPROVED or LOCKED and either have no
 * disbursement or their last disbursement FAILED (so it can be retried).
 */
export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const hasAccess = await checkHrisProAccess(ctx.companyId)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Disbursement requires the Pro plan.' }, { status: 403 })
  }

  const runs = await prisma.payrollRun.findMany({
    where: {
      companyId: ctx.companyId,
      status: { in: ['APPROVED', 'LOCKED'] },
      OR: [
        { disbursement: null },
        { disbursement: { status: 'FAILED' } },
      ],
    },
    select: {
      id:           true,
      periodLabel:  true,
      periodStart:  true,
      periodEnd:    true,
      status:       true,
      totalNetPay:  true,
      createdAt:    true,
      _count: { select: { payslips: true } },
    },
    orderBy: { periodStart: 'desc' },
  })

  return NextResponse.json({
    runs: runs.map(r => ({
      id:          r.id,
      periodLabel: r.periodLabel,
      periodStart: r.periodStart,
      periodEnd:   r.periodEnd,
      status:      r.status,
      totalNetPay: r.totalNetPay.toNumber(),
      employeeCount: r._count.payslips,
    })),
  })
}
