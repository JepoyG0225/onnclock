import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasScreenCaptureFeature, isDesktopApp } from '@/lib/feature-gates'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'
import { syncAutoOvertimeRequest } from '@/lib/overtime-requests'
import {
  computeHours,
  computeLateAndUndertime,
  plannedShiftMinutes,
  resolveShiftForDtr,
} from '@/lib/timesheet/compute'
import { z } from 'zod'
import { differenceInMinutes } from 'date-fns'

const clockOutSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().optional(),
  address: z.string().optional(),
})

async function getCompanyDefaultBreakMinutes(companyId: string): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ defaultBreakMinutes: number | null }>>`
      SELECT "defaultBreakMinutes"
      FROM "companies"
      WHERE "id" = ${companyId}
      LIMIT 1
    `
    const n = Number(rows?.[0]?.defaultBreakMinutes)
    if (!Number.isFinite(n)) return 60
    return Math.max(0, Math.min(720, Math.round(n)))
  } catch {
    return 60
  }
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function computeOverBreakMinutes(
  breakIn: Date | null,
  breakOut: Date | null,
  allowedBreakMinutes: number,
): number {
  if (!breakIn || !breakOut) return 0
  const actualBreakMins = Math.max(0, differenceInMinutes(breakOut, breakIn))
  // Defensive guard for corrupted/stale break records (multi-day break spans).
  // These can happen when a client loses state and resumes days later.
  // We avoid charging absurd overbreak tardiness from obviously invalid spans.
  const MAX_VALID_BREAK_MINUTES = 12 * 60
  if (actualBreakMins > MAX_VALID_BREAK_MINUTES) return 0
  return Math.max(0, actualBreakMins - allowedBreakMinutes)
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  const employeeId = await resolvePortalEmployeeId(ctx)
  const employee = employeeId ? await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNo: true,
      photoUrl: true,
      geofenceExempt: true,
      workScheduleId: true,
      workSchedule: { select: { workDays: true, timeIn: true, timeOut: true, breakMinutes: true } },
      department: { select: { name: true } },
      position: { select: { title: true } },
    },
  }) : null
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const body = await req.json()
  const parsed = clockOutSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { lat, lng, accuracy, address } = parsed.data
  const hasLocation = lat != null && lng != null
  const ua = req.headers.get('user-agent') ?? ''
  const [company, sub] = await Promise.all([
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: {
        geofenceEnabled: true,
        geofenceLat: true,
        geofenceLng: true,
        geofenceRadiusMeters: true,
        screenCaptureEnabled: true,
      },
    }),
    getCompanySubscription(ctx.companyId),
  ])

  const screenCaptureActive =
    (company?.screenCaptureEnabled ?? false) &&
    hasScreenCaptureFeature(sub.pricePerSeat, sub.isTrial)

  if (screenCaptureActive && !isDesktopApp(ua)) {
    return NextResponse.json(
      { error: 'Screen monitoring is enabled. Please use the OnClock Desktop app to clock out.', desktopRequired: true },
      { status: 403 }
    )
  }
  const geofenceEnabled = (company?.geofenceEnabled ?? false) && !employee.geofenceExempt
  let geofenceWarning: string | null = null
  if (geofenceEnabled && hasLocation) {
    if (
      !company ||
      company.geofenceLat == null ||
      company.geofenceLng == null ||
      company.geofenceRadiusMeters == null
    ) {
      geofenceWarning = 'Geo-fence is enabled but not configured'
    } else {
      const dist = distanceMeters(lat!, lng!, company.geofenceLat, company.geofenceLng)
      if (dist > company.geofenceRadiusMeters) {
        return NextResponse.json({ error: 'Outside allowed area for clock out' }, { status: 403 })
      }
    }
  }
  const now = new Date()
  const companyDefaultBreakMinutes = await getCompanyDefaultBreakMinutes(ctx.companyId)
  const activeOpenRecords = await prisma.dTRRecord.findMany({
    where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null },
    orderBy: { timeIn: 'desc' },
  })

  const existing = activeOpenRecords[0]
  if (!existing) {
    return NextResponse.json({ error: 'No active clock-in record found' }, { status: 409 })
  }
  if (!existing.timeIn) {
    return NextResponse.json({ error: 'No active clock-in record found' }, { status: 409 })
  }

  let breakOutTime: Date | null = null
  let effectiveBreakIn: Date | null = null
  let effectiveBreakOut: Date | null = null
  if (existing.breakIn) {
    effectiveBreakIn = existing.breakIn
    effectiveBreakOut = existing.breakOut ?? now
    breakOutTime = existing.breakOut ?? now
  }
  // Resolve the employee's scheduled start/end + allowed break BEFORE computing
  // hours so the planned shift duration can be used as the regular-hours cap.
  // The shared resolver picks the per-date assignment closest to actual clock-in
  // for multi-shift days, falling back to the fixed schedule otherwise.
  const resolved = await resolveShiftForDtr({
    employeeId: employee.id,
    date: existing.date,
    actualTimeIn: existing.timeIn,
    employee: {
      workScheduleId: employee.workScheduleId,
      workSchedule: employee.workSchedule
        ? {
            timeIn: employee.workSchedule.timeIn ?? null,
            timeOut: employee.workSchedule.timeOut ?? null,
            breakMinutes: employee.workSchedule.breakMinutes ?? null,
          }
        : null,
    },
    defaultBreakMinutes: companyDefaultBreakMinutes,
  })
  const plannedRegularMins = plannedShiftMinutes(resolved.scheduleTimeIn, resolved.scheduleTimeOut)

  const { regularHours, overtimeHours, nightDiffHours } = computeHours(
    existing.timeIn,
    now,
    effectiveBreakIn,
    effectiveBreakOut,
    { plannedRegularMinutes: plannedRegularMins, allowedBreakMinutes: resolved.allowedBreakMinutes },
  )

  const { lateMinutes: baseLateMinutes, undertimeMinutes } = computeLateAndUndertime(
    existing.timeIn,
    now,
    resolved.scheduleTimeIn,
    resolved.scheduleTimeOut,
  )

  const overBreakMinutes = computeOverBreakMinutes(effectiveBreakIn, effectiveBreakOut, resolved.allowedBreakMinutes)
  const lateMinutes = baseLateMinutes + overBreakMinutes

  const staleOpenRecords = activeOpenRecords.slice(1)
  const staleOpenCount = staleOpenRecords.length

  let record: Awaited<ReturnType<typeof prisma.dTRRecord.update>>
  try { record = await prisma.$transaction(async (tx) => {
    const updatedPrimary = await tx.dTRRecord.update({
      where: { id: existing.id },
      data: {
        timeOut: now,
        clockOutLat: lat ?? null,
        clockOutLng: lng ?? null,
        clockOutAccuracy: accuracy ?? null,
        clockOutAddress: address ?? null,
        breakOut: breakOutTime ?? undefined,
        regularHours,
        overtimeHours,
        nightDiffHours,
        lateMinutes,
        undertimeMinutes,
      },
    })

    // Defensive cleanup: if duplicate active shifts exist, close the stale ones
    // with zeroed hours to prevent double-counted worked time.
    if (staleOpenRecords.length > 0) {
      for (const stale of staleOpenRecords) {
        await tx.dTRRecord.update({
          where: { id: stale.id },
          data: {
            timeOut: now,
            breakOut: stale.breakIn ? (stale.breakOut ?? now) : stale.breakOut ?? undefined,
            regularHours: 0,
            overtimeHours: 0,
            nightDiffHours: 0,
            lateMinutes: 0,
            undertimeMinutes: 0,
            remarks: stale.remarks
              ? `${stale.remarks}\n[System] Auto-closed duplicate active shift on clock-out (${now.toISOString()}).`
              : `[System] Auto-closed duplicate active shift on clock-out (${now.toISOString()}).`,
          },
        })
      }
    }

    return updatedPrimary
  }) } catch (e: unknown) {
    const code = (e as { code?: string })?.code
    if (code === 'P2025') {
      return NextResponse.json({ error: 'Clock-out record was not found. Please refresh and try again.' }, { status: 409 })
    }
    throw e
  }

  // Final location ping (only if location was provided)
  if (hasLocation) {
    await prisma.locationPing.create({
      data: {
        employeeId: employee.id,
        dtrRecordId: record.id,
        lat: lat!,
        lng: lng!,
        accuracy,
      },
    })
  }

  let geofenceOut: boolean | null = null
  if (
    hasLocation &&
    geofenceEnabled &&
    company?.geofenceLat != null &&
    company.geofenceLng != null &&
    company.geofenceRadiusMeters != null
  ) {
    const toRad = (d: number) => (d * Math.PI) / 180
    const R = 6371000
    const dLat = toRad(lat! - company.geofenceLat)
    const dLng = toRad(lng! - company.geofenceLng)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(company.geofenceLat)) * Math.cos(toRad(lat!)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const dist = R * c
    geofenceOut = dist > company.geofenceRadiusMeters
  }

  const broadcaster = (globalThis as { __wsBroadcast?: (payload: unknown) => void }).__wsBroadcast
  broadcaster?.({
    type: 'location_update',
    companyId: ctx.companyId,
    employeeId: employee.id,
    location: {
      employeeId: employee.id,
      employee,
      clockInTime: record.timeIn,
      clockOutTime: record.timeOut,
      clockInAddress: record.clockInAddress,
      isClockedIn: false,
      geofenceOut,
      lastPing: hasLocation ? {
        lat: lat!,
        lng: lng!,
        accuracy: accuracy ?? null,
        recordedAt: new Date(),
      } : null,
    },
  })

  await syncAutoOvertimeRequest({
    companyId: ctx.companyId,
    employeeId: employee.id,
    date: record.date,
    timeIn: record.timeIn,
    timeOut: record.timeOut,
    overtimeHours: Number(record.overtimeHours ?? 0),
  })

  // Strip clockInPhoto — large base64 payload not needed by clients
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { clockInPhoto: _photo, ...safeRecord } = record
  return NextResponse.json({
    record: safeRecord,
    message: staleOpenCount > 0
      ? `Clocked out successfully (also auto-closed ${staleOpenCount} duplicate active shift${staleOpenCount > 1 ? 's' : ''}).`
      : 'Clocked out successfully',
    geofenceWarning,
    staleOpenAutoClosed: staleOpenCount,
  })
}
