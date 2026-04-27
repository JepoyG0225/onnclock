import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { z } from 'zod'

const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

const patchSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  notes: z.string().nullable().optional(),
  clearanceDate: z.string().nullable().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const sub = await getCompanySubscription(ctx.companyId)
  if (!hasHrisProFeature(sub.pricePerSeat)) {
    return NextResponse.json({ error: 'Offboarding requires a Pro subscription.' }, { status: 403 })
  }

  const { id } = await params

  const process = await prisma.offboardingProcess.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!process) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ process })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const sub = await getCompanySubscription(ctx.companyId)
  if (!hasHrisProFeature(sub.pricePerSeat)) {
    return NextResponse.json({ error: 'Offboarding requires a Pro subscription.' }, { status: 403 })
  }

  const { id } = await params

  const existing = await prisma.offboardingProcess.findFirst({
    where: { id, companyId: ctx.companyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const updateData: Record<string, unknown> = {}
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes
  if (parsed.data.clearanceDate !== undefined) {
    updateData.clearanceDate = parsed.data.clearanceDate ? new Date(parsed.data.clearanceDate) : null
  }

  const updated = await prisma.offboardingProcess.update({
    where: { id },
    data: updateData,
  })

  // Auto-deactivate employee when offboarding is completed
  if (parsed.data.status === 'COMPLETED') {
    await prisma.employee.update({
      where: { id: existing.employeeId },
      data: { isActive: false },
    })
  }

  return NextResponse.json({ process: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const { id } = await params

  const existing = await prisma.offboardingProcess.findFirst({
    where: { id, companyId: ctx.companyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.offboardingProcess.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
