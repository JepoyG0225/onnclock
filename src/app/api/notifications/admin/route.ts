import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const roleError = requireAdminOrHR(ctx)
  if (roleError) return roleError

  const limit = Math.min(50, parseInt(new URL(req.url).searchParams.get('limit') || '20'))

  const [leaveRequests, dtrPending, disciplinary] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        employee: { companyId: ctx.companyId },
        status: 'PENDING',
      },
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
    prisma.disciplinaryRecord.findMany({
      where: {
        companyId: ctx.companyId,
        status: 'OPEN',
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ])

  const TYPE_LABELS: Record<string, string> = {
    NOTICE_TO_EXPLAIN: 'Notice to Explain',
    NOTICE_OF_DECISION: 'Notice of Decision',
    WRITTEN_WARNING: 'Written Warning',
    SUSPENSION: 'Suspension',
    DEMOTION: 'Demotion',
    TERMINATION: 'Termination',
  }

  const items = [
    ...leaveRequests.map(l => ({
      id: l.id,
      type: 'LEAVE' as const,
      status: l.status,
      createdAt: l.createdAt,
      title: `${l.leaveType?.name ?? 'Leave'} request`,
      employee: `${l.employee.firstName} ${l.employee.lastName}`,
      employeeNo: l.employee.employeeNo,
      href: '/leaves',
    })),
    ...dtrPending.map(r => ({
      id: r.id,
      type: 'DTR' as const,
      status: 'PENDING' as const,
      createdAt: r.createdAt,
      title: 'DTR approval needed',
      employee: `${r.employee.firstName} ${r.employee.lastName}`,
      employeeNo: r.employee.employeeNo,
      href: '/dtr',
    })),
    ...disciplinary.map(d => ({
      id: d.id,
      type: 'DISCIPLINARY' as const,
      status: d.status,
      createdAt: d.createdAt,
      title: `${TYPE_LABELS[d.type] ?? d.type} issued`,
      employee: `${d.employee.firstName} ${d.employee.lastName}`,
      employeeNo: d.employee.employeeNo,
      href: '/disciplinary',
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)

  return NextResponse.json({ items })
}
