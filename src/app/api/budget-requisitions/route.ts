import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { z } from 'zod'

const HR_ROLES = new Set(['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN'])

async function checkBudgetReqAccess(ctx: { role?: string | null; companyId?: string | null }): Promise<NextResponse | null> {
  if (HR_ROLES.has(ctx.role ?? '')) return null // HR always allowed
  const sub = await getCompanySubscription(ctx.companyId ?? '')
  if (hasHrisProFeature(sub.pricePerSeat) || sub.isTrial) return null
  return NextResponse.json(
    { error: 'Budget Requisitions require a Pro or Trial subscription.', notEntitled: true },
    { status: 403 }
  )
}

const itemSchema = z.object({
  description: z.string().min(1),
  quantity:    z.number().positive(),
  unit:        z.string().optional().nullable(),
  unitCost:    z.number().nonnegative(),
})

const createSchema = z.object({
  title:    z.string().min(1, 'Title is required'),
  purpose:  z.string().min(1, 'Purpose is required'),
  neededBy: z.string().optional().nullable(),
  items:    z.array(itemSchema).min(1, 'At least one item is required'),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const gate = await checkBudgetReqAccess(ctx)
  if (gate) return gate

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })
  if (!employee) {
    return NextResponse.json({ requisitions: [], total: 0 })
  }

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  || '1'))
  const limit = Math.min(50, parseInt(searchParams.get('limit') || '20'))
  const status = searchParams.get('status') || undefined

  const where = {
    employeeId: employee.id,
    ...(status && { status: status as never }),
  }

  const [requisitions, total] = await Promise.all([
    prisma.budgetRequisition.findMany({
      where,
      include: {
        items: true,
        attachments: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.budgetRequisition.count({ where }),
  ])

  return NextResponse.json({ requisitions, total, page, limit })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const gate = await checkBudgetReqAccess(ctx)
  if (gate) return gate

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true, companyId: true },
  })
  if (!employee) {
    return NextResponse.json({ error: 'No employee record found for this user' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 422 }
    )
  }

  const { title, purpose, neededBy, items } = parsed.data

  // Compute line totals and grand total
  const enriched = items.map(item => ({
    description: item.description,
    quantity:    item.quantity,
    unit:        item.unit ?? null,
    unitCost:    item.unitCost,
    totalCost:   Math.round(item.quantity * item.unitCost * 100) / 100,
  }))

  const totalAmount = enriched.reduce((sum, i) => sum + i.totalCost, 0)

  const requisition = await prisma.budgetRequisition.create({
    data: {
      companyId:   employee.companyId,
      employeeId:  employee.id,
      title,
      purpose,
      totalAmount,
      neededBy:    neededBy ? new Date(neededBy) : null,
      status:      'PENDING',
      items: {
        create: enriched,
      },
    },
    include: { items: true },
  })

  return NextResponse.json({ requisition }, { status: 201 })
}
