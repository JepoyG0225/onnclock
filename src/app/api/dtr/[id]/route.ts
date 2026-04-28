import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { differenceInMinutes } from 'date-fns'
import { z } from 'zod'

const patchSchema = z.object({
  timeIn: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional().nullable(),
  timeOut: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional().nullable(),
  breakIn: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional().nullable(),
  breakOut: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional().nullable(),
  remarks: z.string().optional().nullable(),
})

function getManilaHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  return Number(parts.find(p => p.type === 'hour')?.value ?? '0')
}

function getManilaMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  return Number(parts.find(p => p.type === 'hour')?.value ?? '0') * 60 + Number(parts.find(p => p.type === 'minute')?.value ?? '0')
}

function parseTimeToMins(v: string | null | undefined): number | null {
  if (!v) return null
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function recompute(timeIn: Date, timeOut: Date, breakIn: Date | null, breakOut: Date | null, schedTimeIn?: string | null, schedTimeOut?: string | null) {
  const MAX = 24 * 60
  const totalMins = Math.min(differenceInMinutes(timeOut, timeIn), MAX)
  const effectiveOut = new Date(timeIn.getTime() + totalMins * 60_000)
  const breakMins = breakIn && breakOut
    ? Math.max(0, differenceInMinutes(breakOut > effectiveOut ? effectiveOut : breakOut, breakIn < timeIn ? timeIn : breakIn))
    : 0
  const worked = Math.max(0, totalMins - breakMins)
  const regularHours = Math.round(Math.min(worked, 480) / 60 * 100) / 100
  const overtimeHours = Math.round(Math.max(0, worked - 480) / 60 * 100) / 100

  let ndMins = 0
  let cursor = new Date(timeIn)
  while (cursor < effectiveOut) {
    if (breakIn && breakOut && cursor >= breakIn && cursor < breakOut) { cursor = new Date(cursor.getTime() + 60_000); continue }
    const h = getManilaHour(cursor)
    if (h >= 22 || h < 6) ndMins++
    cursor = new Date(cursor.getTime() + 60_000)
  }
  const nightDiffHours = Math.round(ndMins / 60 * 100) / 100

  const schedIn = parseTimeToMins(schedTimeIn)
  const schedOut = parseTimeToMins(schedTimeOut)
  const isOvernight = schedIn != null && schedOut != null && schedOut <= schedIn
  const actualInMins = getManilaMinutes(timeIn)
  const actualOutMins = getManilaMinutes(timeOut)
  let normalizedIn = actualInMins
  if (isOvernight && actualInMins < (schedIn ?? 0) && actualInMins < 12 * 60) normalizedIn = actualInMins + 24 * 60
  const lateMinutes = schedIn != null ? Math.max(0, normalizedIn - schedIn) : 0
  let undertimeMinutes = 0
  if (schedOut != null) {
    if (isOvernight) { if (actualOutMins < 12 * 60) undertimeMinutes = Math.max(0, schedOut - actualOutMins) }
    else { undertimeMinutes = Math.max(0, schedOut - actualOutMins) }
  }

  return { regularHours, overtimeHours, nightDiffHours, lateMinutes, undertimeMinutes }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })

  const record = await prisma.dTRRecord.findFirst({
    where: { id, employee: { companyId } },
    include: { employee: { select: { workSchedule: { select: { timeIn: true, timeOut: true } } } } },
  })
  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const { timeIn, timeOut, breakIn, breakOut, remarks } = parsed.data

  const newTimeIn = timeIn ? new Date(timeIn) : record.timeIn
  const newTimeOut = timeOut !== undefined ? (timeOut ? new Date(timeOut) : null) : record.timeOut
  const newBreakIn = breakIn !== undefined ? (breakIn ? new Date(breakIn) : null) : record.breakIn
  const newBreakOut = breakOut !== undefined ? (breakOut ? new Date(breakOut) : null) : record.breakOut

  let computed: ReturnType<typeof recompute> | null = null
  if (newTimeIn && newTimeOut) {
    computed = recompute(
      newTimeIn, newTimeOut, newBreakIn ?? null, newBreakOut ?? null,
      record.employee.workSchedule?.timeIn, record.employee.workSchedule?.timeOut,
    )
  }

  const updated = await prisma.dTRRecord.update({
    where: { id },
    data: {
      ...(newTimeIn ? { timeIn: newTimeIn } : {}),
      timeOut: newTimeOut,
      breakIn: newBreakIn,
      breakOut: newBreakOut,
      ...(computed ?? {}),
      ...(remarks !== undefined ? { remarks } : {}),
    },
  })

  return NextResponse.json({ record: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const record = await prisma.dTRRecord.findFirst({
    where: { id, employee: { companyId } },
  })
  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

  await prisma.dTRRecord.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
