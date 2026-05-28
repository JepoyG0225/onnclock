import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { checkHrisProAccess } from '@/lib/feature-gates'

/**
 * GET /api/disbursement/recent
 * Returns the 20 most recent payroll disbursements for the company.
 */
export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const hasAccess = await checkHrisProAccess(ctx.companyId)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Disbursement requires the Pro plan.' }, { status: 403 })
  }

  const disbursements = await prisma.payrollDisbursement.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { initiatedAt: 'desc' },
    take: 20,
    include: {
      payrollRun: { select: { periodLabel: true } },
      items: {
        select: {
          id: true,
          employeeName: true,
          amount: true,
          channel: true,
          status: true,
          referenceNo: true,
          failureReason: true,
        },
        orderBy: { employeeName: 'asc' },
      },
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
      itemCount: d.items.length,
      items: d.items.map(i => ({
        id: i.id,
        employeeName: i.employeeName,
        amount: i.amount.toNumber(),
        channel: i.channel,
        status: i.status,
        referenceNo: i.referenceNo,
        failureReason: i.failureReason,
      })),
    })),
  })
}
