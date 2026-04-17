import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

const patchSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
  rejectionReason: z.string().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const request = await prisma.overtimeRequest.findFirst({
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
    },
  })

  if (!request) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ request })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const { id } = await params

  const existing = await prisma.overtimeRequest.findFirst({
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

  const { status, rejectionReason } = parsed.data

  const updateData: Record<string, unknown> = { status }
  if (status === 'APPROVED') {
    updateData.approvedById = ctx.userId
    updateData.approvedAt = new Date()
  }
  if (status === 'REJECTED' && rejectionReason) {
    updateData.rejectionReason = rejectionReason
  }

  const updated = await prisma.overtimeRequest.update({
    where: { id },
    data: updateData,
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
    },
  })

  return NextResponse.json({ request: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const { id } = await params

  const existing = await prisma.overtimeRequest.findFirst({
    where: { id, companyId: ctx.companyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.overtimeRequest.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
