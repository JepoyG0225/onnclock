import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const [employee, company] = await Promise.all([
    prisma.employee.findFirst({
      where: { userId: ctx.userId, companyId: ctx.companyId },
      include: {
        department: { select: { name: true } },
        position: { select: { title: true } },
        workSchedule: { select: { id: true, name: true, requireSelfieOnClockIn: true } },
      },
    }),
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { selfieRequired: true },
    }),
  ])

  if (!employee) return NextResponse.json({ employee: null }, { status: 404 })

  const selfieRequired =
    !employee.selfieExempt &&
    ((company?.selfieRequired ?? false) || !!employee.workSchedule?.requireSelfieOnClockIn)

  return NextResponse.json({
    employee: {
      ...employee,
      selfieRequired,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const data = {
    firstName: body.firstName,
    middleName: body.middleName ?? null,
    lastName: body.lastName,
    suffix: body.suffix ?? null,
    gender: body.gender,
    birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
    civilStatus: body.civilStatus,
    nationality: body.nationality,
    personalEmail: body.personalEmail ?? null,
    mobileNo: body.mobileNo ?? null,
    sssNo: body.sssNo ?? null,
    philhealthNo: body.philhealthNo ?? null,
    pagibigNo: body.pagibigNo ?? null,
    tinNo: body.tinNo ?? null,
  }

  const existing = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId },
  })
  if (!existing) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const updated = await prisma.employee.update({
    where: { id: existing.id },
    data,
    include: {
      department: { select: { name: true } },
      position: { select: { title: true } },
      workSchedule: { select: { id: true, name: true, requireSelfieOnClockIn: true } },
    },
  })

  return NextResponse.json({ employee: updated })
}
