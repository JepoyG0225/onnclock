import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/disbursement/recent
 * Returns the 20 most recent payroll disbursements for the company.
 */
export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const disbursements = await prisma.payrollDisbursement.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { initiatedAt: 'desc' },
    take: 20,
    include: {
      payrollRun: { select: { periodLabel: true } },
      _count: { select: { items: true } },
    },
  })

  return NextResponse.json({
    disbursements: disbursements.map(d => ({
      id: d.id,
      payrollRunId: d.payrollRunId,
      periodLabel: d.payrollRun.periodLabel,
      totalAmount: d.totalAmount.toNumber(),
      status: d.status,
      initiatedAt: d.initiatedAt,
      completedAt: d.completedAt,
      itemCount: d._count.items,
    })),
  })
}
