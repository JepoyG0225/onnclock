import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { z } from 'zod'

const createSchema = z.object({
  employeeId:    z.string().min(1),
  type:          z.enum(['NOTICE_TO_EXPLAIN', 'NOTICE_OF_DECISION', 'WRITTEN_WARNING', 'SUSPENSION', 'DEMOTION', 'TERMINATION']),
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
  const status     = searchParams.get('status') || undefined
  const employeeId = searchParams.get('employeeId') || undefined
  const type       = searchParams.get('type') || undefined

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
      ...(status             && { status:     status     as 'OPEN' | 'RESPONDED' | 'CLOSED' }),
      ...(scopedEmployeeId   && { employeeId: scopedEmployeeId }),
      ...(type               && { type:       type       as 'NOTICE_TO_EXPLAIN' | 'NOTICE_OF_DECISION' | 'WRITTEN_WARNING' | 'SUSPENSION' | 'DEMOTION' | 'TERMINATION' }),
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
