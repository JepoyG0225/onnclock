/**
 * Device-facing clock event ingest.
 *
 * POST /api/biometric/clock
 *   Headers: Authorization: Bearer <deviceToken>
 *   Body: {
 *     employeeId:  string
 *     eventType:   'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_IN' | 'BREAK_OUT' | 'FAIL_NO_MATCH'
 *     matchScore?: number
 *     capturedAt?: string (ISO8601) — for offline-queue replays
 *   }
 *
 * For successful CLOCK_IN / CLOCK_OUT events we also upsert a DTRRecord
 * on the captured day so the timesheet UI immediately reflects the punch.
 * For FAIL_NO_MATCH we just log the audit event.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireDeviceAuth } from '@/lib/biometric-device-auth'
import { z } from 'zod'

export const runtime = 'nodejs'

const clockSchema = z.object({
  employeeId:  z.string().min(1).optional().nullable(),
  eventType:   z.enum(['CLOCK_IN', 'CLOCK_OUT', 'BREAK_IN', 'BREAK_OUT', 'FAIL_NO_MATCH']),
  matchScore:  z.number().int().min(0).max(100).optional().nullable(),
  capturedAt:  z.string().datetime().optional().nullable(),
  notes:       z.string().max(500).optional().nullable(),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireDeviceAuth(req)
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = clockSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const eventType  = parsed.data.eventType
  const capturedAt = parsed.data.capturedAt ? new Date(parsed.data.capturedAt) : new Date()

  // FAIL_NO_MATCH: only log the audit event, no employee required
  if (eventType === 'FAIL_NO_MATCH') {
    const event = await prisma.biometricClockEvent.create({
      data: {
        deviceId:   ctx.deviceId,
        companyId:  ctx.companyId,
        eventType,
        matchScore: parsed.data.matchScore ?? null,
        capturedAt,
        syncedAt:   new Date(),
        notes:      parsed.data.notes ?? null,
      },
    })
    return NextResponse.json({ event, dtrRecord: null }, { status: 201 })
  }

  // All successful events need an employee
  if (!parsed.data.employeeId) {
    return NextResponse.json({ error: 'employeeId required for successful events' }, { status: 400 })
  }
  const employee = await prisma.employee.findFirst({
    where: { id: parsed.data.employeeId, companyId: ctx.companyId },
    select: { id: true, firstName: true, lastName: true, employeeNo: true },
  })
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found in this company' }, { status: 404 })
  }

  // Anchor the DTR record to the Manila calendar date of the capture
  const phtMs = capturedAt.getTime() + 8 * 60 * 60 * 1000
  const dtrDateUtc = new Date(Math.floor(phtMs / 86_400_000) * 86_400_000)

  const existingDtr = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, date: dtrDateUtc },
    select: { id: true, timeIn: true, timeOut: true, breakIn: true, breakOut: true },
  })

  let dtrRecordId: string | null = existingDtr?.id ?? null

  if (eventType === 'CLOCK_IN') {
    // First clock-in of the day creates the row; later ones don't overwrite
    if (!existingDtr) {
      const created = await prisma.dTRRecord.create({
        data: {
          employeeId: employee.id,
          date:       dtrDateUtc,
          timeIn:     capturedAt,
          source:     'BIOMETRIC',
        },
      })
      dtrRecordId = created.id
    } else if (!existingDtr.timeIn) {
      await prisma.dTRRecord.update({ where: { id: existingDtr.id }, data: { timeIn: capturedAt, source: 'BIOMETRIC' } })
    }
  } else if (eventType === 'CLOCK_OUT') {
    if (!existingDtr) {
      const created = await prisma.dTRRecord.create({
        data: {
          employeeId: employee.id,
          date:       dtrDateUtc,
          timeOut:    capturedAt,
          source:     'BIOMETRIC',
        },
      })
      dtrRecordId = created.id
    } else {
      await prisma.dTRRecord.update({ where: { id: existingDtr.id }, data: { timeOut: capturedAt } })
    }
  } else if (eventType === 'BREAK_IN' && existingDtr) {
    await prisma.dTRRecord.update({ where: { id: existingDtr.id }, data: { breakIn: capturedAt } })
  } else if (eventType === 'BREAK_OUT' && existingDtr) {
    await prisma.dTRRecord.update({ where: { id: existingDtr.id }, data: { breakOut: capturedAt } })
  }

  const event = await prisma.biometricClockEvent.create({
    data: {
      deviceId:    ctx.deviceId,
      companyId:   ctx.companyId,
      employeeId:  employee.id,
      eventType,
      matchScore:  parsed.data.matchScore ?? null,
      capturedAt,
      syncedAt:    new Date(),
      dtrRecordId,
      notes:       parsed.data.notes ?? null,
    },
  })

  return NextResponse.json({
    event,
    employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, employeeNo: employee.employeeNo },
    dtrRecordId,
  }, { status: 201 })
}
