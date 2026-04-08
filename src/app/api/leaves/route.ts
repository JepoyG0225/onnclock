import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createLeaveSchema = z.object({
  leaveTypeId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  totalDays: z.number().positive().optional(),
  reason: z.string().optional().nullable(),
  employeeId: z.string().optional(), // HR can file on behalf
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })
  const employeeId = employee?.id ?? null

  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status') || undefined
  const ownOnly = searchParams.get('own') === 'true'
  const page    = parseInt(searchParams.get('page') || '1')
  const limit   = parseInt(searchParams.get('limit') || '20')

  const isHR = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'SUPER_ADMIN'].includes(ctx.role ?? '')

  // If ownOnly is requested but there's no linked employee, return empty gracefully
  if (ownOnly && !employeeId) {
    return NextResponse.json({ leaves: [], balances: [], total: 0, page, limit })
  }

  const where: Record<string, unknown> = {
    ...(status && { status }),
    ...(isHR && !ownOnly
      ? { employee: { companyId: ctx.companyId } }
      : { employeeId }
    ),
  }

  const [leaves, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNo: true,
            department: { select: { name: true } },
          },
        },
        leaveType: { select: { name: true, code: true, isWithPay: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.leaveRequest.count({ where }),
  ])

  // For employee self-service: include balances
  if (ownOnly && employeeId) {
    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId, year: new Date().getFullYear() },
      include: { leaveType: { select: { name: true, code: true } } },
    })
    return NextResponse.json({ leaves, balances, total, page, limit })
  }

  return NextResponse.json({ leaves, requests: leaves, total, page, limit })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId },
    select: { id: true },
  })
  const employeeId = employee?.id ?? null

  const body = await req.json()
  const parsed = createLeaveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { leaveTypeId, startDate, endDate, reason, employeeId: targetEmployeeId } = parsed.data
  const finalEmployeeId = targetEmployeeId || employeeId

  // Compute working days if totalDays not provided
  let totalDays = parsed.data.totalDays
  if (!totalDays) {
    const start = new Date(startDate)
    const end   = new Date(endDate)
    let days = 0
    const cur = new Date(start)
    while (cur <= end) {
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6) days++
      cur.setDate(cur.getDate() + 1)
    }
    totalDays = Math.max(1, days)
  }

  if (!finalEmployeeId) {
    return NextResponse.json({ error: 'No employee found for this user' }, { status: 400 })
  }

  // Check leave balance
  const balance = await prisma.leaveBalance.findFirst({
    where: {
      employeeId: finalEmployeeId,
      leaveTypeId,
      year: new Date().getFullYear(),
    },
  })

  const available = balance ? (balance.entitled.toNumber() - balance.used.toNumber() - balance.pending.toNumber()) : 0

  if (available < totalDays) {
    return NextResponse.json({
      error: `Insufficient leave balance. Available: ${available} days, Requested: ${totalDays} days`,
    }, { status: 400 })
  }

  const leaveRequest = await prisma.$transaction(async (tx) => {
    const req = await tx.leaveRequest.create({
      data: {
        employeeId: finalEmployeeId,
        leaveTypeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalDays,
        reason,
        status: 'PENDING',
      },
    })

    // Update pending balance
    await tx.leaveBalance.updateMany({
      where: { employeeId: finalEmployeeId, leaveTypeId, year: new Date().getFullYear() },
      data: { pending: { increment: totalDays }, updatedAt: new Date() },
    })

    return req
  })

  return NextResponse.json({ leaveRequest }, { status: 201 })
}
