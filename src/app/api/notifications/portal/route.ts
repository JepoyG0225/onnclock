import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const limit = Math.min(50, parseInt(new URL(req.url).searchParams.get('limit') || '20'))

  try {
    const employee = await prisma.employee.findFirst({
      where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true },
      select: { id: true },
    })
    if (!employee) return NextResponse.json({ items: [] })

    const leaves = await prisma.leaveRequest.findMany({
      where: { employeeId: employee.id, status: { in: ['APPROVED', 'REJECTED'] } },
      include: { leaveType: { select: { name: true } } },
      orderBy: { reviewedAt: 'desc' },
      take: limit,
    })

    const disciplinary = await prisma.disciplinaryRecord.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const corrections = await prisma.timeEntryCorrection.findMany({
      where: { employeeId: employee.id, status: { in: ['APPROVED', 'REJECTED'] } },
      orderBy: { reviewedAt: 'desc' },
      take: limit,
    })

  const TYPE_LABELS: Record<string, string> = {
    NOTICE_TO_EXPLAIN: 'Notice to Explain',
    NOTICE_OF_DECISION: 'Notice of Decision',
    WRITTEN_WARNING: 'Written Warning',
    SUSPENSION: 'Suspension',
    DEMOTION: 'Demotion',
    TERMINATION: 'Termination',
  }

    const items = [
      ...leaves.map(l => ({
        id: l.id,
        type: 'LEAVE' as const,
        status: l.status,
        createdAt: l.reviewedAt ?? l.updatedAt,
        title: `${l.leaveType?.name ?? 'Leave'} ${l.status === 'APPROVED' ? 'approved' : 'rejected'}`,
        href: '/portal/leaves',
      })),
      ...disciplinary.map(d => ({
        id: d.id,
        type: 'DISCIPLINARY' as const,
        status: d.status,
        createdAt: d.createdAt,
        title: `${TYPE_LABELS[d.type] ?? d.type} issued`,
        href: '/portal/disciplinary',
      })),
      ...corrections.map(c => ({
        id: c.id,
        type: 'TIME_CORRECTION' as const,
        status: c.status,
        createdAt: c.reviewedAt ?? c.updatedAt,
        title: `Time correction ${c.status === 'APPROVED' ? 'approved' : 'rejected'}`,
        href: '/portal/time-corrections',
      })),
    ]
      .map(item => ({ ...item, id: `${item.type}:${item.id}` }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)

    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=20' } }
    )
  } catch (err) {
    console.error('[/api/notifications/portal]', err)
    return NextResponse.json(
      { items: [], degraded: true },
      { headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=10' } }
    )
  }
}
