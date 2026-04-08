import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const limit = Math.min(50, parseInt(new URL(req.url).searchParams.get('limit') || '20'))

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ items: [] })

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      employeeId: employee.id,
      status: { in: ['APPROVED', 'REJECTED'] },
    },
    include: { leaveType: { select: { name: true } } },
    orderBy: { reviewedAt: 'desc' },
    take: limit,
  })

  const items = leaves.map(l => ({
    id: l.id,
    type: 'LEAVE' as const,
    status: l.status,
    createdAt: l.reviewedAt ?? l.updatedAt,
    title: `${l.leaveType?.name ?? 'Leave'} ${l.status.toLowerCase()}`,
  }))

  return NextResponse.json({ items })
}
