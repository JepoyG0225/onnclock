import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanyPricePerSeat, hasHrisProFeature } from '@/lib/feature-gates'

const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

const patchSchema = z.object({
  // Manager fields
  strengths:         z.string().optional().nullable(),
  improvementAreas:  z.string().optional().nullable(),
  overallRating:     z.number().min(1).max(5).optional().nullable(),
  managerComment:    z.string().optional().nullable(),
  competencyScores:  z.record(z.string(), z.number().min(1).max(5)).optional(),
  goals:             z.array(z.object({
    id:          z.string(),
    title:       z.string(),
    targetDate:  z.string().optional().nullable(),
    status:      z.enum(['pending', 'achieved', 'missed']).default('pending'),
  })).optional(),
  // Status transition
  status: z.enum(['DRAFT', 'IN_REVIEW', 'COMPLETED']).optional(),
  // Employee self-eval
  employeeComment: z.string().optional().nullable(),
})

// ─── GET /api/performance-reviews/[id] ─────────────────────────────────────────
export async function GET(
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
    include: {
      employee: {
        select: {
          id: true, firstName: true, lastName: true, employeeNo: true,
          photoUrl: true,
          department: { select: { name: true } },
          position:   { select: { title: true } },
        },
      },
      reviewer: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  if (!review) {
    return NextResponse.json({ error: 'Review not found.' }, { status: 404 })
  }

  // Employees can only view their own review
  if (!HR_ROLES.includes(ctx.role)) {
    const emp = await prisma.employee.findFirst({
      where: { companyId: ctx.companyId, userId: ctx.userId },
      select: { id: true },
    })
    const isReviewer = emp?.id === review.reviewerId
    const isReviewee = emp?.id === review.employeeId
    if (!isReviewer && !isReviewee) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }
  }

  return NextResponse.json({ review })
}

// ─── PATCH /api/performance-reviews/[id] ───────────────────────────────────────
export async function PATCH(
  req: NextRequest,
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

  const emp = await prisma.employee.findFirst({
    where: { companyId: ctx.companyId, userId: ctx.userId },
    select: { id: true },
  })

  const isHR       = HR_ROLES.includes(ctx.role)
  const isReviewer = emp?.id === review.reviewerId
  const isReviewee = emp?.id === review.employeeId
  const canManage  = isHR || isReviewer

  // Already acknowledged — no edits allowed
  if (review.status === 'ACKNOWLEDGED') {
    return NextResponse.json({ error: 'Review has been acknowledged and is locked.' }, { status: 409 })
  }

  const body = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!body.success) {
    return NextResponse.json({ error: 'Validation error', details: body.error.flatten() }, { status: 422 })
  }

  const data = body.data
  const updateData: Record<string, unknown> = {}

  // Manager-only fields
  if (canManage) {
    if (data.strengths        !== undefined) updateData.strengths        = data.strengths
    if (data.improvementAreas !== undefined) updateData.improvementAreas = data.improvementAreas
    if (data.overallRating    !== undefined) updateData.overallRating    = data.overallRating
    if (data.managerComment   !== undefined) updateData.managerComment   = data.managerComment
    if (data.competencyScores !== undefined) updateData.competencyScores = data.competencyScores
    if (data.goals            !== undefined) updateData.goals            = data.goals

    // Status transitions
    if (data.status) {
      const current = review.status
      const next    = data.status
      const valid =
        (current === 'DRAFT'     && next === 'IN_REVIEW') ||
        (current === 'IN_REVIEW' && next === 'COMPLETED')

      if (!valid) {
        return NextResponse.json({
          error: `Cannot transition from ${current} to ${next}.`,
        }, { status: 422 })
      }
      updateData.status = next
      if (next === 'COMPLETED') updateData.completedAt = new Date()
    }
  }

  // Employee self-eval — allowed in IN_REVIEW or COMPLETED
  if (isReviewee) {
    if (data.employeeComment !== undefined) {
      if (!['IN_REVIEW', 'COMPLETED'].includes(review.status)) {
        return NextResponse.json({ error: 'Self-evaluation can only be added while review is In Review or Completed.' }, { status: 422 })
      }
      updateData.employeeComment = data.employeeComment
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 422 })
  }

  updateData.updatedAt = new Date()

  const updated = await prisma.performanceReview.update({
    where: { id },
    data: updateData,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
      reviewer: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  return NextResponse.json({ review: updated })
}
