import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'
import { z } from 'zod'

const timePattern = /^([01]?\d|2[0-3]):[0-5]\d$/

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dtrRecordId: z.string().optional(),
  timeIn: z.string().regex(timePattern).optional().nullable(),
  timeOut: z.string().regex(timePattern).optional().nullable(),
  breakIn: z.string().regex(timePattern).optional().nullable(),
  breakOut: z.string().regex(timePattern).optional().nullable(),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
})

// POST — employee creates a correction request
export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  const employeeId = await resolvePortalEmployeeId(ctx)
  if (!employeeId) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: ctx.companyId },
    select: { id: true, companyId: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { date, dtrRecordId, timeIn, timeOut, breakIn, breakOut, reason } = parsed.data

  // Check for duplicate pending request for same date
  const existing = await prisma.timeEntryCorrection.findFirst({
    where: { employeeId, date: new Date(date), status: 'PENDING' },
  })
  if (existing) {
    return NextResponse.json({ error: 'You already have a pending correction request for this date.' }, { status: 409 })
  }

  const correction = await prisma.timeEntryCorrection.create({
    data: {
      companyId: employee.companyId,
      employeeId,
      dtrRecordId: dtrRecordId ?? null,
      date: new Date(date),
      timeIn: timeIn ?? null,
      timeOut: timeOut ?? null,
      breakIn: breakIn ?? null,
      breakOut: breakOut ?? null,
      reason,
      status: 'PENDING',
    },
  })

  return NextResponse.json({ correction }, { status: 201 })
}

// GET — employee views their own requests; admins view all
export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  const { searchParams } = new URL(req.url)
  const isAdmin = ['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'DEPARTMENT_HEAD'].includes(ctx.role)
  const companyId = resolveCompanyIdForRequest(ctx, req) ?? ctx.companyId
  const status = searchParams.get('status') ?? undefined
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 50

  if (isAdmin) {
    const where = {
      companyId,
      ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}),
    }
    const [corrections, total] = await Promise.all([
      prisma.timeEntryCorrection.findMany({
        where,
        include: {
          employee: {
            select: {
              firstName: true, lastName: true, employeeNo: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.timeEntryCorrection.count({ where }),
    ])
    return NextResponse.json({ corrections, total, page, limit })
  }

  // Employee: own requests only
  const employeeId = await resolvePortalEmployeeId(ctx)
  if (!employeeId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const corrections = await prisma.timeEntryCorrection.findMany({
    where: {
      employeeId,
      ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return NextResponse.json({ corrections, total: corrections.length })
}
