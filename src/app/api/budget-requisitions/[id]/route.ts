import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { z } from 'zod'

const HR_ROLES = new Set(['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN'])

async function checkBudgetReqAccess(ctx: { role?: string | null; companyId?: string | null }): Promise<NextResponse | null> {
  if (HR_ROLES.has(ctx.role ?? '')) return null
  const sub = await getCompanySubscription(ctx.companyId ?? '')
  if (hasHrisProFeature(sub.pricePerSeat) || sub.isTrial) return null
  return NextResponse.json(
    { error: 'Budget Requisitions require a Pro or Trial subscription.', notEntitled: true },
    { status: 403 }
  )
}

const patchSchema = z.object({
  status:     z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
  reviewNote: z.string().optional().nullable(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const gate = await checkBudgetReqAccess(ctx)
  if (gate) return gate

  const { id } = await params

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })

  const isHR = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN'].includes(ctx.role ?? '')

  const requisition = await prisma.budgetRequisition.findFirst({
    where: {
      id,
      ...(isHR
        ? { company: { id: ctx.companyId! } }
        : { employeeId: employee?.id ?? '__none__' }
      ),
    },
    include: { items: true },
  })

  if (!requisition) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ requisition })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const gate = await checkBudgetReqAccess(ctx)
  if (gate) return gate

  const isHR = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN'].includes(ctx.role ?? '')

  // Only HR/admin can approve or reject; employees can only cancel their own
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { status, reviewNote } = parsed.data
  const { id } = await params

  // Fetch the requisition
  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })

  const existing = await prisma.budgetRequisition.findFirst({
    where: {
      id,
      ...(isHR
        ? { company: { id: ctx.companyId! } }
        : { employeeId: employee?.id ?? '__none__' }
      ),
    },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Employees can only cancel their own pending requests
  if (!isHR && status !== 'CANCELLED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (!isHR && existing.status !== 'PENDING') {
    return NextResponse.json({ error: 'Only pending requests can be cancelled' }, { status: 400 })
  }

  const updated = await prisma.budgetRequisition.update({
    where: { id },
    data: {
      status,
      ...(isHR
        ? {
            reviewedBy: ctx.userId,
            reviewNote: reviewNote ?? null,
            reviewedAt: new Date(),
          }
        : {}
      ),
    },
    include: { items: true },
  })

  return NextResponse.json({ requisition: updated })
}
