import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'
import { authorizeAdvance, buildPlan, resolveWorkflow } from '@/lib/approvals/engine'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
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

function parseIsoDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

function isMissingTimeCorrectionSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''
  return (
    code === 'P2021' ||
    code === 'P2022' ||
    message.includes('time_entry_corrections') ||
    message.includes('TimeEntryCorrectionStatus')
  )
}

// POST — employee creates a correction request
export async function POST(req: NextRequest) {
  try {
    const { ctx, error } = await requireAuth(undefined, req)
    if (error) return error

    const employeeId = await resolvePortalEmployeeId(ctx)
    if (!employeeId) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: ctx.companyId },
      select: { id: true, companyId: true },
    })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const body = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { date, dtrRecordId, timeIn, timeOut, breakIn, breakOut, reason } = parsed.data

    let resolvedDtrRecordId: string | null = dtrRecordId ?? null
    if (resolvedDtrRecordId) {
      const dtr = await prisma.dTRRecord.findFirst({
        where: { id: resolvedDtrRecordId, employeeId },
        select: { id: true, date: true },
      })
      if (!dtr) {
        return NextResponse.json({ error: 'Selected time entry was not found.' }, { status: 404 })
      }
      const pickedDate = dtr.date.toISOString().slice(0, 10)
      if (pickedDate !== date) {
        return NextResponse.json({ error: 'Selected time entry does not match the chosen date.' }, { status: 400 })
      }
    } else {
      const dtr = await prisma.dTRRecord.findFirst({
        where: { employeeId, date: parseIsoDateOnly(date) },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      resolvedDtrRecordId = dtr?.id ?? null
    }

    const dateOnly = parseIsoDateOnly(date)

    // Check for duplicate pending request for same date
    const existing = await prisma.timeEntryCorrection.findFirst({
      where: { employeeId, date: dateOnly, status: 'PENDING' },
    })
    if (existing) {
      return NextResponse.json({ error: 'You already have a pending correction request for this date.' }, { status: 409 })
    }

    const originalAttendance = resolvedDtrRecordId ? await prisma.dTRRecord.findFirst({
      where: { id: resolvedDtrRecordId, employeeId, employee: { companyId: ctx.companyId } },
      select: { timeIn: true, timeOut: true },
    }) : null
    const correction = await prisma.timeEntryCorrection.create({
      data: {
        companyId: employee.companyId,
        employeeId,
        dtrRecordId: resolvedDtrRecordId,
        date: dateOnly,
        timeIn: timeIn ?? null,
        timeOut: timeOut ?? null,
        breakIn: breakIn ?? null,
        breakOut: breakOut ?? null,
        reason,
        status: 'PENDING',
      },
    })

    await logAudit(ctx, 'CREATE', 'TimeCorrection', correction.id, {
      oldValues: { originalAttendance: originalAttendance ? { timeIn: originalAttendance.timeIn?.toISOString() ?? null, timeOut: originalAttendance.timeOut?.toISOString() ?? null } : null },
      description: `Filed a time entry correction for ${dateOnly.toLocaleDateString()}`,
    }).catch(() => {})
    return NextResponse.json({ correction }, { status: 201 })
  } catch (error: unknown) {
    if (isMissingTimeCorrectionSchemaError(error)) {
      return NextResponse.json(
        { error: 'Time correction feature is not yet enabled in this database. Please run latest migrations.' },
        { status: 503 }
      )
    }
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to submit time correction request', detail }, { status: 500 })
  }
}

// GET — employee views their own requests; admins view all
export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  const { searchParams } = new URL(req.url)
  const canReviewCorrections =
    ['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'DEPARTMENT_HEAD'].includes(ctx.role) ||
    await ctxHasPermission(ctx, 'corrections:approve')
  const companyId = resolveCompanyIdForRequest(ctx, req) ?? ctx.companyId
  const status = searchParams.get('status') ?? undefined
  const requestedPage = Number(searchParams.get('page') ?? '1')
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const limit = 50

  if (canReviewCorrections) {
    const q = (searchParams.get('q') ?? '').trim().slice(0, 120)
    const date = searchParams.get('date') ?? ''
    const baseWhere = {
      companyId,
      ...(q ? { employee: { OR: ['firstName', 'lastName', 'employeeNo'].map(key => ({ [key]: { contains: q, mode: 'insensitive' as const } })) } } : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? { date: new Date(`${date}T00:00:00.000Z`) } : {}),
    }
    const where = {
      ...baseWhere,
      ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}),
    }
    const [corrections, total, counts] = await Promise.all([
      prisma.timeEntryCorrection.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true, firstName: true, lastName: true, employeeNo: true, departmentId: true,
              department: { select: { name: true } },
              position: { select: { title: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.timeEntryCorrection.count({ where }),
      prisma.timeEntryCorrection.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
    ])
    const [originalSnapshots, recordedAttendance] = await Promise.all([
      prisma.auditLog.findMany({
        where: { companyId, entity: 'TimeCorrection', action: 'CREATE', entityId: { in: corrections.map(c => c.id) } },
        select: { entityId: true, oldValues: true },
      }),
      prisma.dTRRecord.findMany({
        where: { id: { in: corrections.filter(c => c.status === 'PENDING').flatMap(c => c.dtrRecordId ? [c.dtrRecordId] : []) }, employee: { companyId } },
        select: { id: true, employeeId: true, timeIn: true, timeOut: true },
      }),
    ])
    const originalFor = (correction: typeof corrections[number]) => {
      const snapshot = originalSnapshots.find(s => s.entityId === correction.id)?.oldValues
      if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && 'originalAttendance' in snapshot) {
        return { originalAttendance: snapshot.originalAttendance, originalAttendanceSource: 'submission' }
      }
      const recorded = recordedAttendance.find(d => d.id === correction.dtrRecordId && d.employeeId === correction.employeeId)
      return { originalAttendance: recorded ? { timeIn: recorded.timeIn, timeOut: recorded.timeOut } : null, originalAttendanceSource: recorded ? 'current' : 'unavailable' }
    }
    const workflowByDepartment = new Map<string, ReturnType<typeof resolveWorkflow>>()
    const correctionsWithAuthorization = await Promise.all(corrections.map(async correction => {
      if (correction.status !== 'PENDING') {
        return { ...correction, canAct: false, actionDisabledReason: undefined }
      }

      const departmentId = correction.employee.departmentId
      const workflowKey = departmentId ?? ''
      let workflowPromise = workflowByDepartment.get(workflowKey)
      if (!workflowPromise) {
        workflowPromise = resolveWorkflow({
          companyId,
          type: 'TIME_CORRECTION',
          departmentId,
        })
        workflowByDepartment.set(workflowKey, workflowPromise)
      }

      const workflow = await workflowPromise
      if (!workflow) {
        return {
          ...correction,
          canAct: canReviewCorrections,
          actionDisabledReason: canReviewCorrections ? undefined : 'You do not have permission to review time corrections',
        }
      }

      const currentLevel = correction.approvalLevel ?? 0
      const plan = buildPlan(workflow, { departmentId: departmentId ?? '' })
      const advance = await authorizeAdvance({
        plan,
        currentLevel,
        actorUserId: ctx.userId,
        requesterDepartmentId: departmentId,
        requesterEmployeeId: correction.employeeId,
      })
      const canAct = advance.noChain || advance.authorized

      return {
        ...correction,
        canAct,
        actionDisabledReason: canAct
          ? undefined
          : advance.currentStep
            ? 'Not authorized for this approval level'
            : `No approver configured for level ${currentLevel + 1}`,
      }
    }))
    return NextResponse.json({ corrections: correctionsWithAuthorization.map(c => ({ ...c, ...originalFor(c) })), total, page, limit, counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])) })
  }

  // Employee: own requests only
  const employeeId = await resolvePortalEmployeeId(ctx)
  if (!employeeId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const corrections = await prisma.timeEntryCorrection.findMany({
    where: {
      employeeId,
      ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}),
    },
    include: {
      employee: {
        select: {
          id: true, firstName: true, lastName: true, employeeNo: true, departmentId: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return NextResponse.json({
    corrections: corrections.map(correction => ({
      ...correction,
      canAct: false,
      actionDisabledReason: 'You do not have permission to review time corrections',
    })),
    total: corrections.length,
  })
}
