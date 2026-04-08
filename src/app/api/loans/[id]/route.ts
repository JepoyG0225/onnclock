import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const loan = await prisma.employeeLoan.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeNo: true } },
      deductions: { orderBy: { createdAt: 'desc' }, take: 24 },
    },
  })

  if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(loan)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()

  // Build update payload — only include defined fields
  const updateData: Record<string, unknown> = {}
  if (body.status              !== undefined) updateData.status              = body.status
  if (body.notes               !== undefined) updateData.notes               = body.notes
  if (body.monthlyAmortization !== undefined) updateData.monthlyAmortization = body.monthlyAmortization
  if (body.balance             !== undefined) updateData.balance             = body.balance

  const loan = await prisma.employeeLoan.updateMany({
    where: { id, companyId: ctx.companyId },
    data: updateData,
  })

  return NextResponse.json(loan)
}
