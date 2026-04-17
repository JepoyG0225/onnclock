import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanyPricePerSeat, hasHrisProFeature } from '@/lib/feature-gates'

const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

const createSchema = z.object({
  cycleLabel:  z.string().min(1).max(100),
  periodStart: z.string(),
  periodEnd:   z.string(),
  reviewerId:  z.string().nullable().optional(),
  employeeIds: z.array(z.string()).min(1),
})

// ─── GET /api/performance-reviews ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const price = await getCompanyPricePerSeat(ctx.companyId)
  if (!hasHrisProFeature(price)) {
    return NextResponse.json({ error: 'Performance Reviews require the Pro plan (₱70/employee).' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status      = searchParams.get('status') || undefined
  const cycleLabel  = searchParams.get('cycle') || undefined
  const reviewerId  = searchParams.get('reviewerId') || undefined
  const employeeId  = searchParams.get('employeeId') || undefined
  const page        = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit       = Math.min(100, parseInt(searchParams.get('limit') || '25'))

  const isHR = HR_ROLES.includes(ctx.role)

  const where: Record<string, unknown> = {
    companyId: ctx.companyId,
    ...(status     && { status }),
    ...(cycleLabel && { cycleLabel }),
    ...(reviewerId && { reviewerId }),
    ...(employeeId && { employeeId }),
  }

  // Non-HR users who are managers only see reviews where they are the reviewer
  if (!isHR) {
    const emp = await prisma.employee.findFirst({
      where: { companyId: ctx.companyId, userId: ctx.userId },
      select: { id: true },
    })
    if (!emp) return NextResponse.json({ reviews: [], total: 0, page, limit })
    where['reviewerId'] = emp.id
  }

  const [reviews, total] = await Promise.all([
    prisma.performanceReview.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNo: true, department: { select: { name: true } }, position: { select: { title: true } } } },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.performanceReview.count({ where }),
  ])

  // Status summary counts
  const counts = await prisma.performanceReview.groupBy({
    by: ['status'],
    where: { companyId: ctx.companyId, ...(isHR ? {} : where) },
    _count: { status: true },
  })
  const statusCounts = Object.fromEntries(counts.map(c => [c.status, c._count.status]))

  return NextResponse.json({ reviews, total, page, limit, statusCounts })
}

// ─── POST /api/performance-reviews ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const price = await getCompanyPricePerSeat(ctx.companyId)
  if (!hasHrisProFeature(price)) {
    return NextResponse.json({ error: 'Performance Reviews require the Pro plan (₱70/employee).' }, { status: 403 })
  }

  const body = createSchema.safeParse(await req.json().catch(() => ({})))
  if (!body.success) {
    return NextResponse.json({ error: 'Validation error', details: body.error.flatten() }, { status: 422 })
  }

  const { cycleLabel, periodStart, periodEnd, reviewerId, employeeIds } = body.data

  // Validate employees belong to company
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, companyId: ctx.companyId, isActive: true },
    select: { id: true },
  })
  if (employees.length === 0) {
    return NextResponse.json({ error: 'No valid active employees found.' }, { status: 400 })
  }

  // Validate reviewer belongs to company (if provided)
  if (reviewerId) {
    const reviewer = await prisma.employee.findFirst({
      where: { id: reviewerId, companyId: ctx.companyId },
    })
    if (!reviewer) {
      return NextResponse.json({ error: 'Reviewer not found in this company.' }, { status: 400 })
    }
  }

  // Create one review per employee (skip duplicates for same cycle+employee)
  const created = await prisma.$transaction(
    employees.map(emp =>
      prisma.performanceReview.upsert({
        where: {
          // Use a composite fallback — if review already exists for this cycle+employee, skip
          id: `pr_${ctx.companyId}_${emp.id}_${cycleLabel.replace(/\s+/g, '_')}`,
        },
        update: {},
        create: {
          id: `pr_${ctx.companyId}_${emp.id}_${cycleLabel.replace(/\s+/g, '_')}`,
          companyId: ctx.companyId,
          employeeId: emp.id,
          reviewerId: reviewerId ?? null,
          cycleLabel,
          periodStart: new Date(periodStart),
          periodEnd:   new Date(periodEnd),
          status: 'DRAFT',
          goals: [],
          competencyScores: {},
        },
      })
    )
  )

  return NextResponse.json({ created: created.length, reviews: created }, { status: 201 })
}
