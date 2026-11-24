import { HrError } from '@/lib/hr-center/service'
import { randomUUID } from 'node:crypto'
import { profileSchema, changesFor } from '@/lib/hr-center/profile'
import { addEvent, jsonData } from '@/lib/hr-center/service'
import { reserveEmployeeSeat, SeatLimitError } from '@/lib/billing/restore-seat'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { deleteEmployeePermanently } from '@/lib/employees/delete'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
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

    if (!await ctxHasPermission(ctx, 'employees:write')) return NextResponse.json({ error: 'Employee edit permission is required.' }, { status: 403 })

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
        isExemptFromTax: true, isMinimumWageEarner: true, disableNightDifferential: true, disableHolidayPay: true, disableEarlyInOt: true, disableBeyondScheduleOt: true,
        disableLateDeduction: true, disableUndertimeDeduction: true,
        trackTime: true,
        sssEnabled: true, philhealthEnabled: true, pagibigEnabled: true,
        withholdingTaxEnabled: true,
      },
    })
    if (!existing) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    // Duplicate employee-number guard. The unique key is (companyId, employeeNo)
    // and it spans inactive/soft-deleted employees too, so a number "freed up"
    // by deactivation is still reserved. Give a clear 409 instead of a raw P2002.
    if (body.employeeNo && body.employeeNo !== existing.employeeNo) {
      const clash = await prisma.employee.findFirst({
        where: { companyId: ctx.companyId, employeeNo: body.employeeNo, NOT: { id } },
        select: { id: true, firstName: true, lastName: true, isActive: true },
      })
      if (clash) {
        return NextResponse.json(
          {
            error: `Employee number "${body.employeeNo}" is already used by ${clash.firstName} ${clash.lastName}`
              + `${clash.isActive ? '' : ' (an inactive employee)'}. Choose a different number.`,
            code: 'DUPLICATE_EMPLOYEE_NO',
          },
          { status: 409 },
        )
      }
    }

    const seat = body.isActive === true ? await getSeatStatus(ctx.companyId) : null

    // Convert empty strings / undefined to null for nullable fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = (v: any) => (v === undefined ? undefined : v === '' ? null : v)

    // Use the workScheduleId directly — never auto-create "Custom Day Offs" schedules.
    // dayOffDays is intentionally ignored: day-off customisation is handled via
    // shift assignments (EmployeeShiftAssignment), not by spawning extra schedules.
    const resolvedWorkScheduleId =
      body.workScheduleId !== undefined
        ? (body.workScheduleId || null)
        : existing.workScheduleId

    // Relation FK fields require connect/disconnect syntax in Prisma v5 EmployeeUpdateInput
    const deptOp = body.departmentId !== undefined
      ? (body.departmentId ? { connect: { id: body.departmentId } } : { disconnect: true })
      : undefined
    const posOp = body.positionId !== undefined
      ? (body.positionId ? { connect: { id: body.positionId } } : { disconnect: true })
      : undefined
    const scheduleOp = body.workScheduleId !== undefined
      ? (resolvedWorkScheduleId ? { connect: { id: resolvedWorkScheduleId } } : { disconnect: true })
      : undefined
    const managerOp = body.directManagerId !== undefined
      ? (body.directManagerId ? { connect: { id: body.directManagerId } } : { disconnect: true })
      : undefined

    await prisma.$transaction(async tx => {
      if (body.isActive === true && ctx.role !== 'SUPER_ADMIN' && seat?.enforceCap) await reserveEmployeeSeat(tx, ctx.companyId, id)
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${id} AND "companyId" = ${ctx.companyId} FOR UPDATE`
      const profileBefore = await tx.employee.findUniqueOrThrow({ where: { id } })
      if ((body.basicSalary != null && Number(body.basicSalary)!==Number(profileBefore.basicSalary)) || (body.rateType && body.rateType!==profileBefore.rateType)) {
        if(await tx.hrOperation.count({where:{companyId:ctx.companyId,employeeId:id,kind:'SALARY_CHANGE',status:'APPROVED'}}))throw new HrError('Use HR Center > Salary changes to update this employee rate. Dated salary history is already active.',409)
      }
      const profileAfter = await tx.employee.update({
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
        nationality:              body.nationality !== undefined ? (body.nationality || 'Filipino') : undefined,
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
        ...(deptOp ? { department: deptOp } : {}),
        ...(posOp ? { position: posOp } : {}),
        ...(scheduleOp ? { workSchedule: scheduleOp } : {}),
        ...(managerOp ? { manager: managerOp } : {}),
        employmentStatus:         body.employmentStatus,
        employmentType:           body.employmentType,
        hireDate:                 body.hireDate           ? new Date(body.hireDate)           : undefined,
        regularizationDate:       body.regularizationDate !== undefined ? (body.regularizationDate ? new Date(body.regularizationDate) : null) : undefined,
        resignationDate:          body.resignationDate !== undefined ? (body.resignationDate ? new Date(body.resignationDate) : null) : undefined,
        terminationDate:          body.terminationDate !== undefined ? (body.terminationDate ? new Date(body.terminationDate) : null) : undefined,
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
        bankBic:                  n(body.bankBic),
        isExemptFromTax:          body.isExemptFromTax          != null ? Boolean(body.isExemptFromTax)          : undefined,
        isMinimumWageEarner:      body.isMinimumWageEarner      != null ? Boolean(body.isMinimumWageEarner)      : undefined,
        disableHolidayPay:        body.disableHolidayPay        != null ? Boolean(body.disableHolidayPay)        : undefined,
        disableEarlyInOt: typeof body.disableEarlyInOt === 'boolean' ? body.disableEarlyInOt : undefined,
        disableNightDifferential: typeof body.disableNightDifferential === 'boolean' ? body.disableNightDifferential : undefined,
        disableBeyondScheduleOt: typeof body.disableBeyondScheduleOt === 'boolean' ? body.disableBeyondScheduleOt : undefined,
        disableLateDeduction:     body.disableLateDeduction     != null ? Boolean(body.disableLateDeduction)     : undefined,
        disableUndertimeDeduction: body.disableUndertimeDeduction != null ? Boolean(body.disableUndertimeDeduction) : undefined,
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
      const auditedFields = Object.fromEntries(Object.keys(profileSchema.shape).map(key => [key, profileAfter[key as keyof typeof profileAfter]]))
      const changes = changesFor(profileBefore as unknown as Record<string, unknown>, auditedFields)
      if (Object.keys(changes).length) {
        const record = await tx.hrOperation.create({ data: { companyId: ctx.companyId, employeeId: id, requestKey: randomUUID(), kind: 'PROFILE_CHANGE', title: 'Profile updated by HR', status: 'APPLIED', data: jsonData({ changes }), createdBy: ctx.userId } })
        await addEvent(tx, record.id, ctx.userId, 'ADMIN_APPLIED', { changes })
      }
    }, { timeout: 30000 })

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
        isExemptFromTax: true, isMinimumWageEarner: true, disableNightDifferential: true, disableHolidayPay: true, disableEarlyInOt: true, disableBeyondScheduleOt: true,
        disableLateDeduction: true, disableUndertimeDeduction: true,
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

    logAudit(ctx, 'UPDATE', 'Employee', id, {
      description: `Updated employee record ${existing.employeeNo}`,
    }).catch(() => {})

    return NextResponse.json({ success: true, recompute, credit })
  } catch (e: unknown) {
    if (e instanceof HrError) return NextResponse.json({error:e.message},{status:e.status})
    if (e instanceof SeatLimitError) return NextResponse.json({ error: e.message, code: 'SEAT_LIMIT_EXCEEDED' }, { status: 402 })
    // Friendly handling for a duplicate employee number (unique constraint on
    // companyId + employeeNo) — surface a clear 409 instead of a raw 500.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = (e.meta?.target as string[] | string | undefined)
      const isEmpNo = Array.isArray(target) ? target.includes('employeeNo') : String(target ?? '').includes('employeeNo')
      return NextResponse.json(
        {
          error: isEmpNo
            ? 'That employee number is already used by another employee in this company. Choose a different number.'
            : 'A record with these details already exists.',
          code: 'DUPLICATE',
        },
        { status: 409 },
      )
    }
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[PATCH /api/employees/:id]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!await ctxHasPermission(ctx, 'employees:delete')) return NextResponse.json({ error: 'You do not have permission to delete employees.' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body || !['inactive', 'permanent'].includes(body.action) || (body.action === 'permanent' && body.confirmation !== 'DELETE')) {
    return NextResponse.json({ error: 'Choose Make inactive or confirm permanent deletion by typing DELETE.' }, { status: 400 })
  }
  try {
    const employee = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${id} AND "companyId" = ${ctx.companyId} FOR UPDATE`
      const record = await tx.employee.findFirst({ where: { id, companyId: ctx.companyId }, select: { id: true, companyId: true, userId: true, employeeNo: true, isActive: true } })
      if (!record) return null
      if (body.action === 'permanent') await deleteEmployeePermanently(tx, record)
      else await tx.employee.update({ where: { id }, data: { isActive: false } })
      await tx.auditLog.create({ data: {
        companyId: ctx.companyId, userId: ctx.userId, entity: 'Employee', entityId: id,
        action: body.action === 'permanent' ? 'DELETE' : 'DEACTIVATE',
        oldValues: { employeeNo: record.employeeNo, wasActive: record.isActive },
        newValues: { description: `${body.action === 'permanent' ? 'Permanently deleted employee and linked records' : 'Deactivated employee'} ${record.employeeNo}` },
      } })
      return record
    }, { timeout: 60000 })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    let credit = null
    if (employee.isActive) {
      try { credit = await issueDeactivationCredit({ companyId: ctx.companyId, employeeId: id, notes: `${body.action === 'permanent' ? 'Permanently deleted' : 'Deactivated'} ${employee.employeeNo}` }) }
      catch (error) { console.error('[employee deletion] credit failed', error) }
    }
    return NextResponse.json({ success: true, action: body.action, credit })
  } catch (error) {
    console.error('[employee deletion]', error)
    return NextResponse.json({ error: 'Could not complete the deletion. Please refresh and try again.' }, { status: 500 })
  }
}
