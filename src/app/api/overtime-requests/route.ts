import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { syncAutoOvertimeRequestsForCompany } from '@/lib/overtime-requests'
import { z } from 'zod'

const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

const createSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  hours: z.number().positive(),
  reason: z.string().min(1),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const employeeId = searchParams.get('employeeId') || undefined
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')

  const syncFrom = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
  const syncTo = dateTo ? new Date(dateTo) : new Date()
  await syncAutoOvertimeRequestsForCompany({
    companyId: ctx.companyId,
    dateFrom: syncFrom,
    dateTo: syncTo,
  })

  const where: Record<string, unknown> = { companyId: ctx.companyId }
  if (status) where.status = status
  if (employeeId) where.employeeId = employeeId
  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo && { lte: new Date(dateTo) }),
    }
  }

  const [requests, total] = await Promise.all([
    prisma.overtimeRequest.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.overtimeRequest.count({ where }),
  ])

  return NextResponse.json({ requests, total, page, limit })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { employeeId, date, startTime, endTime, hours, reason } = parsed.data

  // Verify employee belongs to company
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: ctx.companyId },
  })
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }

  const request = await prisma.overtimeRequest.create({
    data: {
      companyId: ctx.companyId,
      employeeId,
      date: new Date(date),
      startTime,
      endTime,
      hours,
      reason,
      status: 'PENDING',
    },
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

  return NextResponse.json({ request }, { status: 201 })
}
