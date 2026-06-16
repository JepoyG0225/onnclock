import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN']

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const record = await prisma.disciplinaryRecord.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          department: { select: { name: true } },
          position:   { select: { title: true } },
        },
      },
    },
  })

  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ record })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const existing = await prisma.disciplinaryRecord.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { employee: { select: { id: true, userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const isEmployee = ctx.role === 'EMPLOYEE'

  // Employees can only submit their own NTE response
  if (isEmployee) {
    if (existing.employee.userId !== ctx.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (existing.type !== 'NOTICE_TO_EXPLAIN') {
      return NextResponse.json({ error: 'Responses are only allowed for Notice to Explain' }, { status: 400 })
    }
    if (existing.status === 'CLOSED') {
      return NextResponse.json({ error: 'This record is already closed' }, { status: 400 })
    }
    if (!body.response?.trim()) {
      return NextResponse.json({ error: 'Response text is required' }, { status: 422 })
    }
    const record = await prisma.disciplinaryRecord.update({
      where: { id },
      data: {
        response: body.response.trim(),
        respondedAt: new Date(),
        status: 'RESPONDED',
      },
    })
    return NextResponse.json({ record })
  }

  // HR / Admin: full update
  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const updateData: Record<string, unknown> = {}
  if (body.status      !== undefined) updateData.status      = body.status
  if (body.response    !== undefined) updateData.response    = body.response
  if (body.respondedAt !== undefined) updateData.respondedAt = body.respondedAt ? new Date(body.respondedAt) : null

  const record = await prisma.disciplinaryRecord.update({
    where: { id },
    data: updateData,
    include: {
      employee: {
        select: {
          id: true, firstName: true, lastName: true, employeeNo: true,
          department: { select: { name: true } },
          position:   { select: { title: true } },
        },
      },
    },
  })

  return NextResponse.json({ record })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const existing = await prisma.disciplinaryRecord.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.disciplinaryRecord.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
