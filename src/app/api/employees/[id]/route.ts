import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  diffPayrollAffectingFields,
  recomputeRunsForEmployee,
} from '@/lib/payroll/recompute-runs'
import { getSeatStatus } from '@/lib/billing/seat-limit'
import { issueDeactivationCredit } from '@/lib/billing/credit'


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

    // Verify the employee belongs to this company first.
    // Pull every payroll-affecting field so we can diff post-update and
    // know whether any in-flight payroll runs need a recompute.
    const existing = await prisma.employee.findFirst({
      where: { id, companyId: ctx.companyId },
      select: {
        id: true, employeeNo: true, workScheduleId: true,
        rateType: true, basicSalary: true, dailyRate: true, hourlyRate: true,
        payFrequency: true,
        isActive: true,
        isExemptFromTax: true, isMinimumWageEarner: true, disableHolidayPay: true,
        trackTime: true,
        sssEnabled: true, philhealthEnabled: true, pagibigEnabled: true,
        withholdingTaxEnabled: true,
      },
    })
    if (!existing) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    // Reactivation seat-cap guard. PATCH may flip isActive false→true via
    // the EmployeeStatusButton component — that bumps the active count
    // against paid seats the same way a fresh create does, so apply the
    // same gate. SUPER_ADMIN and TRIAL bypass via getSeatStatus.
    const willActivate = body.isActive === true && existing.isActive === false
    if (willActivate && ctx.role !== 'SUPER_ADMIN') {
      const seat = await getSeatStatus(ctx.companyId)
      if (seat.enforceCap && seat.activeCount >= seat.paidSeats) {
        return NextResponse.json(
          {
            error: `Seat limit reached: ${seat.activeCount} of ${seat.paidSeats} paid seats in use. Upgrade your subscription to reactivate this employee.`,
            code: 'SEAT_LIMIT_EXCEEDED',
            activeCount: seat.activeCount,
            paidSeats: seat.paidSeats,
          },
          { status: 402 },
        )
      }
    }

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
        disableHolidayPay:        body.disableHolidayPay        != null ? Boolean(body.disableHolidayPay)        : undefined,
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

    // ── Auto-recompute any in-flight payroll runs ────────────────────────
    // If any payroll-affecting field actually changed value, re-run the
    // compute for every DRAFT / COMPUTED / FOR_APPROVAL run that already
    // has a payslip for this employee. Best-effort — failures are logged
    // but never block the primary PATCH.
    const after = await prisma.employee.findUnique({
      where: { id },
      select: {
        rateType: true, basicSalary: true, dailyRate: true, hourlyRate: true,
        payFrequency: true,
        isExemptFromTax: true, isMinimumWageEarner: true, disableHolidayPay: true,
        trackTime: true,
        sssEnabled: true, philhealthEnabled: true, pagibigEnabled: true,
        withholdingTaxEnabled: true,
      },
    })
    const changedFields = after
      ? diffPayrollAffectingFields(
          existing as unknown as Record<string, unknown>,
          after as unknown as Record<string, unknown>,
        )
      : []
    let recompute = null as null | { scheduled: number; succeeded: number; failed: number; fields: string[] }
    if (changedFields.length > 0) {
      const origin = new URL(req.url).origin
      const result = await recomputeRunsForEmployee(id, ctx.companyId, origin)
      recompute = { ...result, fields: changedFields }
    }

    // ── Deactivation credit ──────────────────────────────────────────────
    // PATCH may flip isActive true→false (admin "deactivate" path). When
    // the company is on an ACTIVE subscription, issue a pro-rated credit
    // for the freed-up seat. No-op for TRIAL / EXPIRED — they never paid
    // for the seat, so there's nothing to refund.
    let credit: { amount: number; entryId: string | null; reason?: string } | null = null
    const willDeactivate = body.isActive === false && existing.isActive === true
    if (willDeactivate) {
      try {
        credit = await issueDeactivationCredit({
          companyId: ctx.companyId,
          employeeId: id,
          notes: `Deactivated ${existing.employeeNo}`,
        })
      } catch (err) {
        // Don't fail the deactivation just because the credit couldn't
        // be issued — log and continue.
        console.error('[PATCH /api/employees/:id] credit issuance failed', err)
      }
    }

    return NextResponse.json({ success: true, recompute, credit })
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

  // Soft delete — just mark as inactive. Need the employee number first
  // so we can stamp the credit ledger entry with it for audit.
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true, employeeNo: true, isActive: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  await prisma.employee.updateMany({
    where: { id, companyId: ctx.companyId },
    data: { isActive: false, updatedAt: new Date() },
  })

  // Only issue credit if the employee was active immediately before this
  // call — otherwise we'd double-credit on repeated soft-delete clicks.
  let credit: { amount: number; entryId: string | null; reason?: string } | null = null
  if (employee.isActive) {
    try {
      credit = await issueDeactivationCredit({
        companyId: ctx.companyId,
        employeeId: id,
        notes: `Soft-deleted ${employee.employeeNo}`,
      })
    } catch (err) {
      console.error('[DELETE /api/employees/:id] credit issuance failed', err)
    }
  }

  return NextResponse.json({ success: true, credit })
}
