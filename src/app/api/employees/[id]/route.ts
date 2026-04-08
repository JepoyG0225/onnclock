import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function deriveWorkDaysFromDayOffs(dayOffDays: number[] | undefined): number[] {
  const fullWeek = [0, 1, 2, 3, 4, 5, 6]
  const off = new Set((dayOffDays ?? []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))
  const workDays = fullWeek.filter(d => !off.has(d))
  return workDays.length > 0 ? workDays : [1, 2, 3, 4, 5]
}

async function resolveCustomScheduleId(params: {
  companyId: string
  employeeNo: string
  baseScheduleId?: string | null
  dayOffDays?: number[]
}) {
  if (!params.dayOffDays) return params.baseScheduleId ?? null

  const baseSchedule = params.baseScheduleId
    ? await prisma.workSchedule.findFirst({
        where: { id: params.baseScheduleId, companyId: params.companyId },
      })
    : null

  const workDays = deriveWorkDaysFromDayOffs(params.dayOffDays)
  const customName = `${params.employeeNo} - Custom Day Offs`
  const existing = await prisma.workSchedule.findFirst({
    where: { companyId: params.companyId, name: customName, isActive: true },
  })

  const payload = {
    scheduleType: baseSchedule?.scheduleType ?? 'FIXED',
    requireSelfieOnClockIn: baseSchedule?.requireSelfieOnClockIn ?? false,
    workDays,
    timeIn: baseSchedule?.timeIn ?? '08:00',
    timeOut: baseSchedule?.timeOut ?? '17:00',
    breakMinutes: Number(baseSchedule?.breakMinutes ?? 60),
    workHoursPerDay: baseSchedule?.workHoursPerDay ?? 8,
    workDaysPerWeek: workDays.length,
    isActive: true,
  }

  if (existing) {
    const updated = await prisma.workSchedule.update({
      where: { id: existing.id },
      data: payload,
    })
    return updated.id
  }

  const created = await prisma.workSchedule.create({
    data: {
      companyId: params.companyId,
      name: customName,
      ...payload,
    },
  })
  return created.id
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      department: true,
      position: true,
      workSchedule: true,
      manager: { select: { id: true, firstName: true, lastName: true } },
      documents: true,
      leaveBalances: {
        include: { leaveType: true },
        where: { year: new Date().getFullYear() },
      },
      loans: { where: { status: 'ACTIVE' } },
      taxExemptions: {
        where: { effectiveYear: new Date().getFullYear() },
      },
    },
  })

  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ employee })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { ctx, error } = await requireAuth()
    if (error) return error

    const body = await req.json()

    // Verify the employee belongs to this company first
    const existing = await prisma.employee.findFirst({
      where: { id, companyId: ctx.companyId },
      select: { id: true, employeeNo: true, workScheduleId: true },
    })
    if (!existing) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    // Convert empty strings / undefined to null for nullable fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = (v: any) => (v === '' || v === undefined ? null : v)

    const parsedDayOffDays = Array.isArray(body.dayOffDays)
      ? body.dayOffDays
          .map((d: unknown) => Number(d))
          .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
      : undefined

    const resolvedWorkScheduleId = await resolveCustomScheduleId({
      companyId: ctx.companyId,
      employeeNo: body.employeeNo || existing.employeeNo,
      baseScheduleId: body.workScheduleId ?? existing.workScheduleId,
      dayOffDays: parsedDayOffDays,
    })

    // Relation FK fields require connect/disconnect syntax in Prisma v5 EmployeeUpdateInput
    const deptOp       = body.departmentId   ? { connect: { id: body.departmentId   } } : { disconnect: true }
    const posOp        = body.positionId     ? { connect: { id: body.positionId     } } : { disconnect: true }
    const scheduleOp   = resolvedWorkScheduleId ? { connect: { id: resolvedWorkScheduleId } } : { disconnect: true }
    const managerOp    = body.directManagerId ? { connect: { id: body.directManagerId } } : { disconnect: true }

    await prisma.employee.update({
      where: { id },
      data: {
        employeeNo:               body.employeeNo,
        firstName:                body.firstName,
        lastName:                 body.lastName,
        middleName:               n(body.middleName),
        suffix:                   n(body.suffix),
        gender:                   body.gender,
        birthDate:                body.birthDate ? new Date(body.birthDate) : undefined,
        birthPlace:               n(body.birthPlace),
        civilStatus:              body.civilStatus,
        nationality:              body.nationality || 'Filipino',
        religion:                 n(body.religion),
        personalEmail:            n(body.personalEmail),
        workEmail:                n(body.workEmail),
        mobileNo:                 n(body.mobileNo),
        phoneNo:                  n(body.phoneNo),
        presentAddress:           n(body.presentAddress),
        permanentAddress:         n(body.permanentAddress),
        sssNo:                    n(body.sssNo),
        tinNo:                    n(body.tinNo),
        philhealthNo:             n(body.philhealthNo),
        pagibigNo:                n(body.pagibigNo),
        emergencyContactName:     n(body.emergencyContactName),
        emergencyContactRelation: n(body.emergencyContactRelation),
        emergencyContactPhone:    n(body.emergencyContactPhone),
        department:               deptOp,
        position:                 posOp,
        workSchedule:             scheduleOp,
        manager:                  managerOp,
        employmentStatus:         body.employmentStatus,
        employmentType:           body.employmentType,
        hireDate:                 body.hireDate           ? new Date(body.hireDate)           : undefined,
        regularizationDate:       body.regularizationDate ? new Date(body.regularizationDate) : null,
        resignationDate:          body.resignationDate    ? new Date(body.resignationDate)    : null,
        terminationDate:          body.terminationDate    ? new Date(body.terminationDate)    : null,
        rateType:                 body.rateType,
        basicSalary:              body.basicSalary != null ? Number(body.basicSalary) : undefined,
        payFrequency:             body.payFrequency,
        bankName:                 n(body.bankName),
        bankAccountNo:            n(body.bankAccountNo),
        isExemptFromTax:          body.isExemptFromTax     != null ? Boolean(body.isExemptFromTax)     : undefined,
        isMinimumWageEarner:      body.isMinimumWageEarner != null ? Boolean(body.isMinimumWageEarner) : undefined,
        trackTime:                body.trackTime           != null ? Boolean(body.trackTime)           : undefined,
        notes:                    n(body.notes),
      },
    })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[PATCH /api/employees/:id]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  // Soft delete — just mark as inactive
  await prisma.employee.updateMany({
    where: { id, companyId: ctx.companyId },
    data: { isActive: false, updatedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
