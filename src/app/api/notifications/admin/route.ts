import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const roleError = requireAdminOrHR(ctx)
  if (roleError) return roleError

  const limit = Math.min(50, parseInt(new URL(req.url).searchParams.get('limit') || '20'))

  const [leaveRequests, dtrPending] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { employee: { companyId: ctx.companyId } },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNo: true } },
        leaveType: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.dTRRecord.findMany({
      where: {
        employee: { companyId: ctx.companyId },
        timeOut: { not: null },
        approvedBy: null,
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ])

  const items = [
    ...leaveRequests.map(l => ({
      id: l.id,
      type: 'LEAVE' as const,
      status: l.status,
      createdAt: l.createdAt,
      title: `${l.leaveType?.name ?? 'Leave'} request`,
      employee: `${l.employee.firstName} ${l.employee.lastName}`,
      employeeNo: l.employee.employeeNo,
    })),
    ...dtrPending.map(r => ({
      id: r.id,
      type: 'DTR' as const,
      status: 'PENDING' as const,
      createdAt: r.createdAt,
      title: 'DTR approval',
      employee: `${r.employee.firstName} ${r.employee.lastName}`,
      employeeNo: r.employee.employeeNo,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)

  return NextResponse.json({ items })
}
