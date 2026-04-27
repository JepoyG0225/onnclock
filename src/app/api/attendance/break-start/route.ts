import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'
import { getManilaDateOnly } from '@/lib/date-manila'

function normalizeBreakMinutes(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 60
  return Math.max(0, Math.min(720, Math.round(n)))
}

async function getCompanyDefaultBreakMinutes(companyId: string): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ defaultBreakMinutes: number | null }>>`
      SELECT "defaultBreakMinutes"
      FROM "companies"
      WHERE "id" = ${companyId}
      LIMIT 1
    `
    return normalizeBreakMinutes(rows?.[0]?.defaultBreakMinutes)
  } catch {
    return 60
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  const employeeId = await resolvePortalEmployeeId(ctx)
  const employee = employeeId ? await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      workSchedule: { select: { breakMinutes: true } },
    },
  }) : null
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const now = new Date()
  const existing = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null },
    orderBy: { timeIn: 'desc' },
  })

  if (!existing) {
    return NextResponse.json({ error: 'No active clock-in record found' }, { status: 409 })
  }
  if (existing.breakIn && !existing.breakOut) {
    return NextResponse.json({ error: 'Break already started' }, { status: 409 })
  }

  const companyDefaultBreakMinutes = await getCompanyDefaultBreakMinutes(ctx.companyId)
  const assignment = await prisma.employeeShiftAssignment.findFirst({
    where: { employeeId: employee.id, date: getManilaDateOnly() },
    select: { schedule: { select: { breakMinutes: true } } },
  })

  const allowedBreakMinutes = normalizeBreakMinutes(
    assignment?.schedule?.breakMinutes ??
      employee.workSchedule?.breakMinutes ??
      companyDefaultBreakMinutes
  )
  if (allowedBreakMinutes <= 0) {
    return NextResponse.json({ error: 'Break is disabled for your schedule.' }, { status: 409 })
  }

  const record = await prisma.dTRRecord.update({
    where: { id: existing.id },
    data: {
      breakIn: now,
      breakOut: null,
    },
  })

  return NextResponse.json({ record, message: 'Break started', allowedBreakMinutes })
}
