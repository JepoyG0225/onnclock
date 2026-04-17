import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanyPricePerSeat, hasHrisProFeature } from '@/lib/feature-gates'

// GET /api/performance-reviews/my — employee's own reviews (portal)
export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const price = await getCompanyPricePerSeat(ctx.companyId)
  if (!hasHrisProFeature(price)) {
    return NextResponse.json({ reviews: [] })
  }

  const emp = await prisma.employee.findFirst({
    where: { companyId: ctx.companyId, userId: ctx.userId },
    select: { id: true },
  })
  if (!emp) return NextResponse.json({ reviews: [] })

  const reviews = await prisma.performanceReview.findMany({
    where: { employeeId: emp.id, companyId: ctx.companyId },
    include: {
      reviewer: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ reviews })
}
