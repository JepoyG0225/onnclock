import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { action, notes } = await req.json() // action: 'approve' | 'reject'

  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      leaveTypeId: true,
      startDate: true,
      endDate: true,
      totalDays: true,
      status: true,
      approvalLevel: true,
      reviewedBy: true,
      reviewedAt: true,
      reviewNotes: true,
      employee: true,
      leaveType: { select: { isWithPay: true, name: true } },
    },
  })

  if (!leaveRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (leaveRequest.status !== 'PENDING') {
    return NextResponse.json({ error: 'Leave request is not pending' }, { status: 400 })
  }

  const approvers = await prisma.approverConfig.findMany({
    where: { companyId: ctx.companyId, type: 'LEAVE' },
    orderBy: { level: 'asc' },
  })
  const maxLevel = approvers.length
  const currentLevel = leaveRequest.approvalLevel ?? 0
  const nextLevel = currentLevel + 1
  const expectedApprover = approvers.find(a => a.level === nextLevel)

  if (maxLevel > 0) {
    if (!expectedApprover || expectedApprover.userId !== ctx.userId) {
      return NextResponse.json({ error: 'Not authorized for this approval level' }, { status: 403 })
    }
  }

  const isFinal = maxLevel === 0 || nextLevel >= maxLevel
  const newStatus = action === 'approve'
    ? (isFinal ? 'APPROVED' : 'PENDING')
    : 'REJECTED'

  let prevTrail: unknown[] = []
  try {
    const trailRow = await prisma.leaveRequest.findUnique({
      where: { id },
      select: { approvalTrail: true },
    })
    prevTrail = Array.isArray(trailRow?.approvalTrail) ? trailRow?.approvalTrail : []
  } catch {
    prevTrail = []
  }
  const trailEntry = {
    level: maxLevel > 0 ? nextLevel : 1,
    userId: ctx.userId,
    action,
    notes: notes ?? null,
    at: new Date().toISOString(),
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: newStatus,
          approvalLevel: action === 'approve' ? nextLevel : currentLevel,
          approvalTrail: [...prevTrail, trailEntry] as Prisma.InputJsonValue,
          reviewedBy: action === 'approve' && !isFinal ? leaveRequest.reviewedBy : ctx.userId,
          reviewedAt: action === 'approve' && !isFinal ? leaveRequest.reviewedAt : new Date(),
          reviewNotes: action === 'approve' && !isFinal ? leaveRequest.reviewNotes : notes,
        },
      })

    if (action === 'approve' && isFinal) {
      // Move from pending to used
      await tx.leaveBalance.updateMany({
        where: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year: leaveRequest.startDate.getFullYear(),
        },
        data: {
          used: { increment: leaveRequest.totalDays.toNumber() },
          pending: { decrement: leaveRequest.totalDays.toNumber() },
          updatedAt: new Date(),
        },
      })

      // Auto-create DTR leave entries (skip weekends)
      const start = new Date(leaveRequest.startDate)
      const end = new Date(leaveRequest.endDate)
      start.setHours(0, 0, 0, 0)
      end.setHours(0, 0, 0, 0)

      const dates: Date[] = []
      const cursor = new Date(start)
      while (cursor <= end) {
        const dow = cursor.getDay()
        if (dow !== 0 && dow !== 6) dates.push(new Date(cursor))
        cursor.setDate(cursor.getDate() + 1)
      }

      const existing = await tx.dTRRecord.findMany({
        where: {
          employeeId: leaveRequest.employeeId,
          date: { in: dates },
        },
        select: { id: true, date: true, timeIn: true, timeOut: true },
      })
      const existingMap = new Map(existing.map(r => [r.date.toISOString().split('T')[0], r]))

      for (const d of dates) {
        const key = d.toISOString().split('T')[0]
        const prev = existingMap.get(key)
        if (prev && (prev.timeIn || prev.timeOut)) continue

        await tx.dTRRecord.upsert({
          where: { employeeId_date: { employeeId: leaveRequest.employeeId, date: d } },
          update: {
            isLeave: true,
            isLeavePaid: !!leaveRequest.leaveType?.isWithPay,
            isAbsent: false,
            remarks: leaveRequest.leaveType?.name ? `Leave - ${leaveRequest.leaveType.name}` : 'Leave',
            leaveRequestId: leaveRequest.id,
          },
          create: {
            employeeId: leaveRequest.employeeId,
            date: d,
            isLeave: true,
            isLeavePaid: !!leaveRequest.leaveType?.isWithPay,
            isAbsent: false,
            remarks: leaveRequest.leaveType?.name ? `Leave - ${leaveRequest.leaveType.name}` : 'Leave',
            leaveRequestId: leaveRequest.id,
          },
        })
      }
    } else if (action === 'reject') {
      // Restore pending balance on reject
      await tx.leaveBalance.updateMany({
        where: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year: leaveRequest.startDate.getFullYear(),
        },
        data: {
          pending: { decrement: leaveRequest.totalDays.toNumber() },
          updatedAt: new Date(),
        },
      })
    }
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
      return NextResponse.json(
        { error: 'Database schema is out of date. Run prisma migrate to add approval columns.' },
        { status: 500 },
      )
    }
    throw e
  }

  return NextResponse.json({ success: true, status: newStatus })
}
