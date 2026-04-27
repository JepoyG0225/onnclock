import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const upsertSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(['FIXED', 'FLEXIBLE']).optional(),
  scheduleId: z.string().optional().nullable(),
  timeIn: z.string().optional().nullable(),
  timeOut: z.string().optional().nullable(),
  isRestDay: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
})

// GET /api/schedules/assignments?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error
    const companyId = resolveCompanyIdForRequest(ctx, req)
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }

    const { searchParams } = req.nextUrl
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const deptId = searchParams.get('departmentId') || undefined
    const mode = (searchParams.get('mode') || '').toUpperCase() as '' | 'FIXED' | 'FLEXIBLE'

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
    }

    const employeeSelect = {
      id: true,
      employeeNo: true,
      firstName: true,
      lastName: true,
      middleName: true,
      department: { select: { id: true, name: true } },
      position: { select: { title: true } },
      workScheduleId: true,
      workSchedule: { select: { scheduleType: true } },
    } as const

    // Fetch employees in this company
    let employees = await prisma.employee.findMany({
      where: {
        companyId,
        isActive: true,
        ...(deptId ? { departmentId: deptId } : {}),
      },
      select: employeeSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    // Fallback for companies with no active-flagged records yet.
    if (employees.length === 0) {
      employees = await prisma.employee.findMany({
        where: {
          companyId,
          ...(deptId ? { departmentId: deptId } : {}),
        },
        select: employeeSelect,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
    }

    // Fetch assignments for the date range
    let assignments: Array<{
      id: string
      employeeId: string
      date: Date
      scheduleId: string | null
      timeIn: string | null
      timeOut: string | null
      isRestDay: boolean
      notes: string | null
      schedule: { id: string; name: string; timeIn: string | null; timeOut: string | null } | null
    }> = []
    try {
      const assignmentModel = (prisma as unknown as {
        employeeShiftAssignment?: {
          findMany: (args: unknown) => Promise<Array<{
            id: string
            employeeId: string
            date: Date
            scheduleId: string | null
            timeIn: string | null
            timeOut: string | null
            isRestDay: boolean
            notes: string | null
            schedule: { id: string; name: string; timeIn: string | null; timeOut: string | null } | null
          }>>
        }
      }).employeeShiftAssignment

      if (assignmentModel?.findMany) {
        assignments = await assignmentModel.findMany({
          where: {
            companyId,
            date: { gte: new Date(startDate), lte: new Date(endDate) },
          },
          select: {
            id: true,
            employeeId: true,
            date: true,
            scheduleId: true,
            timeIn: true,
            timeOut: true,
            isRestDay: true,
            notes: true,
            schedule: { select: { id: true, name: true, timeIn: true, timeOut: true } },
          },
        })
      } else {
        const rows = await prisma.$queryRaw<Array<{
          id: string
          employeeId: string
          date: Date
          scheduleId: string | null
          timeIn: string | null
          timeOut: string | null
          isRestDay: boolean
          notes: string | null
          scheduleName: string | null
          scheduleTimeIn: string | null
          scheduleTimeOut: string | null
        }>>`
          SELECT
            a."id",
            a."employeeId",
            a."date",
            a."scheduleId",
            a."timeIn",
            a."timeOut",
            a."isRestDay",
            a."notes",
            s."name" AS "scheduleName",
            s."timeIn" AS "scheduleTimeIn",
            s."timeOut" AS "scheduleTimeOut"
          FROM "employee_shift_assignments" a
          LEFT JOIN "work_schedules" s ON s."id" = a."scheduleId"
          WHERE a."companyId" = ${companyId}
            AND a."date" >= ${startDate}::date
            AND a."date" <= ${endDate}::date
        `

        assignments = rows.map(row => ({
          id: row.id,
          employeeId: row.employeeId,
          date: new Date(row.date),
          scheduleId: row.scheduleId,
          timeIn: row.timeIn,
          timeOut: row.timeOut,
          isRestDay: row.isRestDay,
          notes: row.notes,
          schedule: row.scheduleId
            ? {
                id: row.scheduleId,
                name: row.scheduleName ?? '',
                timeIn: row.scheduleTimeIn,
                timeOut: row.scheduleTimeOut,
              }
            : null,
        }))
      }
    } catch (assignmentErr) {
      console.warn('[GET /api/schedules/assignments] assignment query failed; returning employees only', assignmentErr)
      assignments = []
    }

    // Route employees to the correct tab based on their assigned schedule's type.
    // Employees with no schedule or a FLEXIBLE schedule → FLEXIBLE tab.
    // Employees with a FIXED schedule → FIXED tab.
    if (mode === 'FLEXIBLE') {
      employees = employees.filter(emp => emp.workSchedule?.scheduleType !== 'FIXED')
    } else if (mode === 'FIXED') {
      employees = employees.filter(emp => emp.workSchedule?.scheduleType === 'FIXED')
    }

    return NextResponse.json({ employees, assignments })
  } catch (err) {
    console.error('[GET /api/schedules/assignments]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/schedules/assignments — upsert one assignment
export async function POST(req: NextRequest) {
  try {
    const { ctx, error } = await requireAuth()
    if (error) return error

    if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = upsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { employeeId, date, mode, scheduleId, timeIn, timeOut, isRestDay, notes } = parsed.data

    // Verify employee belongs to this company
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: ctx.companyId },
    })
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    if (mode === 'FIXED' && !isRestDay && !scheduleId) {
      return NextResponse.json(
        { error: 'Fixed schedule assignment requires a schedule template.' },
        { status: 400 }
      )
    }

    const dateObj = new Date(date)

    // If scheduleId provided and times not set, pull from template
    let resolvedTimeIn = timeIn ?? null
    let resolvedTimeOut = timeOut ?? null
    let resolvedSchedule: { id: string; name: string; timeIn: string | null; timeOut: string | null } | null = null
    if (scheduleId && !resolvedTimeIn && !resolvedTimeOut) {
      const sched = await prisma.workSchedule.findFirst({
        where: { id: scheduleId, companyId: ctx.companyId },
        select: { id: true, name: true, timeIn: true, timeOut: true },
      })
      if (sched) {
        resolvedSchedule = sched
        resolvedTimeIn = sched.timeIn
        resolvedTimeOut = sched.timeOut
      }
    }

    // Keep fixed/flexible membership mutually exclusive.
    if (mode === 'FIXED') {
      if (!isRestDay && scheduleId) {
        await prisma.employee.update({
          where: { id: employeeId },
          data: { workScheduleId: scheduleId },
        })
      }
    } else if (mode === 'FLEXIBLE') {
      if (emp.workScheduleId) {
        await prisma.employee.update({
          where: { id: employeeId },
          data: { workScheduleId: null },
        })
      }
    }

    // Upsert with Prisma delegate when available, otherwise fallback to raw SQL
    const assignmentModel = (prisma as unknown as {
      employeeShiftAssignment?: {
        findFirst: (args: unknown) => Promise<{ id: string } | null>
        update: (args: unknown) => Promise<unknown>
        create: (args: unknown) => Promise<unknown>
      }
    }).employeeShiftAssignment

    let assignment: unknown
    if (assignmentModel?.findFirst) {
      const existing = await assignmentModel.findFirst({
        where: { employeeId, date: dateObj },
      })

      if (existing) {
        assignment = await assignmentModel.update({
          where: { id: existing.id },
          data: {
            scheduleId: scheduleId ?? null,
            timeIn: isRestDay ? null : (resolvedTimeIn ?? null),
            timeOut: isRestDay ? null : (resolvedTimeOut ?? null),
            isRestDay: isRestDay ?? false,
            notes: notes ?? null,
            updatedAt: new Date(),
          },
          include: { schedule: { select: { id: true, name: true, timeIn: true, timeOut: true } } },
        })
      } else {
        assignment = await assignmentModel.create({
          data: {
            id: randomUUID(),
            companyId: ctx.companyId,
            employeeId,
            date: dateObj,
            scheduleId: scheduleId ?? null,
            timeIn: isRestDay ? null : (resolvedTimeIn ?? null),
            timeOut: isRestDay ? null : (resolvedTimeOut ?? null),
            isRestDay: isRestDay ?? false,
            notes: notes ?? null,
          },
          include: { schedule: { select: { id: true, name: true, timeIn: true, timeOut: true } } },
        })
      }
    } else {
      const existingRows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "employee_shift_assignments"
        WHERE "employeeId" = ${employeeId}
          AND "date" = ${date}::date
        LIMIT 1
      `

      const nextId = existingRows[0]?.id ?? randomUUID()
      if (existingRows[0]?.id) {
        await prisma.$executeRaw`
          UPDATE "employee_shift_assignments"
          SET "scheduleId" = ${scheduleId ?? null},
              "timeIn" = ${isRestDay ? null : (resolvedTimeIn ?? null)},
              "timeOut" = ${isRestDay ? null : (resolvedTimeOut ?? null)},
              "isRestDay" = ${isRestDay ?? false},
              "notes" = ${notes ?? null},
              "updatedAt" = NOW()
          WHERE "id" = ${nextId}
        `
      } else {
        await prisma.$executeRaw`
          INSERT INTO "employee_shift_assignments"
            ("id", "companyId", "employeeId", "date", "scheduleId", "timeIn", "timeOut", "isRestDay", "notes", "createdAt", "updatedAt")
          VALUES
            (${nextId}, ${ctx.companyId}, ${employeeId}, ${date}::date, ${scheduleId ?? null}, ${isRestDay ? null : (resolvedTimeIn ?? null)}, ${isRestDay ? null : (resolvedTimeOut ?? null)}, ${isRestDay ?? false}, ${notes ?? null}, NOW(), NOW())
        `
      }

      assignment = {
        id: nextId,
        employeeId,
        date: dateObj,
        scheduleId: scheduleId ?? null,
        timeIn: isRestDay ? null : (resolvedTimeIn ?? null),
        timeOut: isRestDay ? null : (resolvedTimeOut ?? null),
        isRestDay: isRestDay ?? false,
        notes: notes ?? null,
        schedule:
          scheduleId && !isRestDay
            ? {
                id: scheduleId,
                name: resolvedSchedule?.name ?? '',
                timeIn: resolvedSchedule?.timeIn ?? null,
                timeOut: resolvedSchedule?.timeOut ?? null,
              }
            : null,
      }
    }

    return NextResponse.json({ assignment })
  } catch (err) {
    console.error('[POST /api/schedules/assignments]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
