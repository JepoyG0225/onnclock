import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanyPricePerSeat, hasHrisProFeature } from '@/lib/feature-gates'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const price = await getCompanyPricePerSeat(ctx.companyId)
  if (!hasHrisProFeature(price)) {
    return NextResponse.json({ error: 'Performance Reviews require the Pro plan.' }, { status: 403 })
  }

  const review = await prisma.performanceReview.findFirst({
    where: { id, companyId: ctx.companyId },
  })
  if (!review) {
    return NextResponse.json({ error: 'Review not found.' }, { status: 404 })
  }

  if (review.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Only completed reviews can be acknowledged.' }, { status: 422 })
  }

  // Only the reviewed employee can acknowledge
  const emp = await prisma.employee.findFirst({
    where: { companyId: ctx.companyId, userId: ctx.userId },
    select: { id: true },
  })
  if (!emp || emp.id !== review.employeeId) {
    return NextResponse.json({ error: 'Only the reviewed employee can acknowledge this review.' }, { status: 403 })
  }

  const updated = await prisma.performanceReview.update({
    where: { id },
    data: {
      status:          'ACKNOWLEDGED',
      acknowledgedAt:  new Date(),
      updatedAt:       new Date(),
    },
  })

  return NextResponse.json({ review: updated })
}
