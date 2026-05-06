import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'


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
      select: { id: true, employeeNo: true, workScheduleId: true, rateType: true, basicSalary: true },
    })
    if (!existing) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    // Convert empty strings / undefined to null for nullable fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = (v: any) => (v === '' || v === undefined ? null : v)

    // Use the workScheduleId directly — never auto-create "Custom Day Offs" schedules.
    // dayOffDays is intentionally ignored: day-off customisation is handled via
    // shift assignments (EmployeeShiftAssignment), not by spawning extra schedules.
    const resolvedWorkScheduleId =
      body.workScheduleId !== undefined
        ? (body.workScheduleId || null)
        : existing.workScheduleId

    // Relation FK fields require connect/disconnect syntax in Prisma v5 EmployeeUpdateInput
    const deptOp       = body.departmentId   ? { connect: { id: body.departmentId   } } : { disconnect: true }
    const posOp        = body.positionId     ? { connect: { id: body.positionId     } } : { disconnect: true }
    const scheduleOp   = resolvedWorkScheduleId ? { connect: { id: resolvedWorkScheduleId } } : { disconnect: true }
    const managerOp    = body.directManagerId ? { connect: { id: body.directManagerId } } : { disconnect: true }

    await prisma.employee.update({
      where: { id },
      data: {
        ...(body.isActive != null ? { isActive: Boolean(body.isActive) } : {}),
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
        // Re-derive dailyRate / hourlyRate whenever basicSalary or rateType is updated.
        // MONTHLY → daily = salary/22, hourly = daily/8
        // DAILY   → daily = basicSalary, hourly = daily/8
        // HOURLY  → hourly = basicSalary, daily = hourly*8
        ...(() => {
          if (body.basicSalary == null && body.rateType == null) return {}
          const rt   = body.rateType ?? existing.rateType
          const base = body.basicSalary != null ? Number(body.basicSalary) : Number(existing.basicSalary)
          const WORK_HOURS = 8
          if (rt === 'HOURLY') return { hourlyRate: base, dailyRate: base * WORK_HOURS }
          if (rt === 'DAILY')  return { dailyRate: base,  hourlyRate: base / WORK_HOURS }
          /* MONTHLY */ const daily = base / 22
          return { dailyRate: daily, hourlyRate: daily / WORK_HOURS }
        })(),
        payFrequency:             body.payFrequency,
        bankName:                 n(body.bankName),
        bankAccountNo:            n(body.bankAccountNo),
        isExemptFromTax:          body.isExemptFromTax          != null ? Boolean(body.isExemptFromTax)          : undefined,
        isMinimumWageEarner:      body.isMinimumWageEarner      != null ? Boolean(body.isMinimumWageEarner)      : undefined,
        trackTime:                body.trackTime                != null ? Boolean(body.trackTime)                : undefined,
        fingerprintExempt:        body.fingerprintExempt        != null ? Boolean(body.fingerprintExempt)        : undefined,
        geofenceExempt:           body.geofenceExempt           != null ? Boolean(body.geofenceExempt)           : undefined,
        selfieExempt:             body.selfieExempt             != null ? Boolean(body.selfieExempt)             : undefined,
        sssEnabled:               body.sssEnabled               != null ? Boolean(body.sssEnabled)               : undefined,
        philhealthEnabled:        body.philhealthEnabled        != null ? Boolean(body.philhealthEnabled)        : undefined,
        pagibigEnabled:           body.pagibigEnabled           != null ? Boolean(body.pagibigEnabled)           : undefined,
        withholdingTaxEnabled:    body.withholdingTaxEnabled    != null ? Boolean(body.withholdingTaxEnabled)    : undefined,
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
