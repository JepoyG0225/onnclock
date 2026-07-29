import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const roleError = requireAdminOrHR(ctx)
  if (roleError) return roleError

  const limit = Math.min(50, parseInt(new URL(req.url).searchParams.get('limit') || '20'))

  try {
    // Five independent reads — fire them in parallel so total wall
    // time is max(individual query) instead of sum. The sequential
    // version below was reliably hitting the 5s Prisma timeout (5.02s
    // executions in production traces) because each query waited for
    // the previous one to finish.
    const empSelect = { firstName: true, lastName: true, employeeNo: true } as const
    const [leaveRequests, dtrPending, disciplinary, timeCorrections, overtimeRequests] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: { employee: { companyId: ctx.companyId }, status: 'PENDING' },
        include: { employee: { select: empSelect }, leaveType: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.dTRRecord.findMany({
        where: {
          employee: { companyId: ctx.companyId },
          timeOut: { not: null },
          approvedBy: null,
        },
        include: { employee: { select: empSelect } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.disciplinaryRecord.findMany({
        where: { companyId: ctx.companyId, status: 'OPEN' },
        include: { employee: { select: empSelect } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.timeEntryCorrection.findMany({
        where: { companyId: ctx.companyId, status: 'PENDING' },
        include: { employee: { select: empSelect } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.overtimeRequest.findMany({
        where: { companyId: ctx.companyId, status: 'PENDING' },
        include: { employee: { select: empSelect } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ])

  const TYPE_LABELS: Record<string, string> = {
    INCIDENT_REPORT: 'Incident Report',
    NOTICE_TO_EXPLAIN: 'Notice to Explain',
    NOTICE_OF_DECISION: 'Notice of Decision',
    VERBAL_WARNING: 'Verbal Warning',
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
      ...timeCorrections.map(c => ({
        id: c.id,
        type: 'TIME_CORRECTION' as const,
        status: c.status,
        createdAt: c.createdAt,
        title: 'Time correction request pending',
        employee: `${c.employee.firstName} ${c.employee.lastName}`,
        employeeNo: c.employee.employeeNo,
        href: '/time-corrections',
      })),
      ...overtimeRequests.map(o => ({
        id: o.id,
        type: 'OVERTIME' as const,
        status: o.status,
        createdAt: o.createdAt,
        title: `Overtime request — ${Number(o.hours).toFixed(1)}h`,
        employee: `${o.employee.firstName} ${o.employee.lastName}`,
        employeeNo: o.employee.employeeNo,
        href: '/overtime-requests',
      })),
    ]
      .map(item => ({ ...item, id: `${item.type}:${item.id}` }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)

    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=20' } }
    )
  } catch (err) {
    console.error('[/api/notifications/admin]', err)
    return NextResponse.json(
      { items: [], degraded: true },
      { headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=10' } }
    )
  }
}
