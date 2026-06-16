import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/** GET /api/admin/disbursement-topups — list all top-ups for Super Admin review */
export async function GET() {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN'])
  if (error) return error

  void ctx

  const topUps = await prisma.disbursementTopUp.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      amountPeso: true,
      status: true,
      confirmedAt: true,
      createdAt: true,
      company: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json({
    topUps: topUps.map(t => ({
      id:          t.id,
      amountPeso:  t.amountPeso.toNumber(),
      status:      t.status,
      confirmedAt: t.confirmedAt,
      createdAt:   t.createdAt,
      company:     t.company,
    })),
  })
}
