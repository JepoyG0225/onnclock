import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { DisciplinaryType, DisciplinaryStatus } from '@prisma/client'
import { z } from 'zod'

// Derived from the generated Prisma enum rather than hand-listed. A hand-written
// copy silently fell behind the database (INCIDENT_REPORT and VERBAL_WARNING were
// missing), so records of those types could neither be filtered nor created.
const DISCIPLINARY_TYPES = Object.values(DisciplinaryType) as [DisciplinaryType, ...DisciplinaryType[]]

const createSchema = z.object({
  employeeId:    z.string().min(1),
  type:          z.enum(DISCIPLINARY_TYPES),
  incident:      z.string().min(1),
  description:   z.string().min(1),
  dateOfIncident: z.string(),
  dateIssued:    z.string(),
  issuedBy:      z.string().min(1),
})

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN']

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  // Disciplinary is a Pro feature. Employees can only access it on Pro or Trial plans.
  // HR/Admin roles always have access regardless of plan.
  const HR_ROLES_SET = new Set(HR_ROLES)
  if (!HR_ROLES_SET.has(ctx.role)) {
    const sub = await getCompanySubscription(ctx.companyId)
    if (!hasHrisProFeature(sub.pricePerSeat) && !sub.isTrial) {
      return NextResponse.json(
        { error: 'Disciplinary records require a Pro subscription.', notEntitled: true },
        { status: 403 }
      )
    }
  }

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get('employeeId') || undefined

  // Validate rather than cast. A blind `as` on a query param lets any junk value
  // reach Prisma, which rejects it at the driver and turns a bad filter into a
  // 500 — the page then just says "Failed to load records". Unknown values are
  // ignored so the list still renders.
  const statusParam = searchParams.get('status')
  const typeParam   = searchParams.get('type')
  const status = statusParam && statusParam in DisciplinaryStatus
    ? (statusParam as DisciplinaryStatus) : undefined
  const type = typeParam && typeParam in DisciplinaryType
    ? (typeParam as DisciplinaryType) : undefined

  // Employees only see their own records
  let scopedEmployeeId = employeeId
  if (ctx.role === 'EMPLOYEE') {
    const emp = await prisma.employee.findFirst({
      where: { userId: ctx.userId, companyId: ctx.companyId },
      select: { id: true },
    })
    if (!emp) return NextResponse.json({ records: [] })
    scopedEmployeeId = emp.id
  }

  const records = await prisma.disciplinaryRecord.findMany({
    where: {
      companyId: ctx.companyId,
      ...(status           && { status }),
      ...(scopedEmployeeId && { employeeId: scopedEmployeeId }),
      ...(type             && { type }),
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          department: { select: { name: true } },
          position:   { select: { title: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ records })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { employeeId, type, incident, description, dateOfIncident, dateIssued, issuedBy } = parsed.data

  // Verify employee belongs to this company
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }

  const record = await prisma.disciplinaryRecord.create({
    data: {
      companyId: ctx.companyId,
      employeeId,
      type,
      incident,
      description,
      dateOfIncident: new Date(dateOfIncident),
      dateIssued:     new Date(dateIssued),
      issuedBy,
      status: 'OPEN',
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          department: { select: { name: true } },
          position:   { select: { title: true } },
        },
      },
    },
  })

  return NextResponse.json({ record }, { status: 201 })
}
