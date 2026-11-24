import { halfDayWorkedShift } from './half-day-leave'
import { NextRequest, NextResponse } from 'next/server'
import type { AuthContext } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasScreenCaptureFeature, isDesktopApp } from '@/lib/feature-gates'
import { resolvePunchEmployeeId } from '@/lib/attendance/punch-target'
import { syncAutoOvertimeRequest } from '@/lib/overtime-requests'
import {
  computeHours,
  computeLateAndUndertime,
  getCompanyNightDiffWindow,
  normalizeSingleShiftTimeOut,
  plannedShiftMinutes,
  resolveShiftForDtr,
} from '@/lib/timesheet/compute'
import { resolveAttendanceLocation, savedGeofence } from '@/lib/attendance/schedule-location'
import { locationError, geofenceStatus } from '@/lib/attendance/location-policy'
import { z } from 'zod'
import { normalizeActivityPhoto } from '@/lib/attendance/activities'
import { differenceInMinutes } from 'date-fns'

const clockOutSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().optional(),
  address: z.string().optional(),
  photo: z.string().max(2_000_000).optional(),
  /** See the same field on clock-in: kiosk punches name their employee. */
  employeeId: z.string().optional(),
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

export async function performClockOut(req: NextRequest, ctx: AuthContext, verifiedEmployeeId?: string) {

  // Body first, because the target employee can come from it (kiosk punches).
  const preBody = await req.json()
  const preParsed = clockOutSchema.safeParse(preBody)
  if (!preParsed.success) {
    return NextResponse.json({ error: preParsed.error.flatten() }, { status: 400 })
  }
  const target = await resolvePunchEmployeeId(ctx, preParsed.data.employeeId, verifiedEmployeeId)
  if (target.forbidden) {
    return NextResponse.json({ error: target.forbidden }, { status: 403 })
  }
  const employeeId = target.employeeId
  const employee = employeeId ? await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNo: true,
      photoUrl: true,
      geofenceExempt: true,
      selfieExempt: true,
      workScheduleId: true,
      workSchedule: { select: { timezone: true, requireSelfieOnClockIn: true, workDays: true, timeIn: true, timeOut: true, breakMinutes: true, workHoursPerDay: true } },
      department: { select: { name: true } },
      position: { select: { title: true } },
    },
  }) : null
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const { lat, lng, accuracy, address } = preParsed.data
  const hasLocation = lat != null && lng != null
  const ua = req.headers.get('user-agent') ?? ''
  const [company, sub] = await Promise.all([
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: {
        selfieRequired: true,
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

  // Browser clock-out is blocked when screen monitoring is enforced so
  // the desktop app's final capture lands in the audit trail. We only
  // enforce on PAID Pro subscribers — TRIAL customers can be evaluating
  // the feature without the desktop app rolled out yet, so we let them
  // clock out from the portal in the browser. The screen captures they
  // already have during the shift are still recorded; only the very
  // last frame at clock-out is skipped.
  if (screenCaptureActive && !isDesktopApp(ua) && !sub.isTrial) {
    return NextResponse.json(
      { error: 'Screen monitoring is enabled. Please use the OnClock Desktop app to clock out.', desktopRequired: true },
      { status: 403 }
    )
  }
  const geofenceWarning: string | null = null
  const now = new Date()
  const companyDefaultBreakMinutes = await getCompanyDefaultBreakMinutes(ctx.companyId)
  const activeOpenRecords = await prisma.dTRRecord.findMany({
    where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null },
    orderBy: { timeIn: 'desc' },
  })

  const selfieRequired = !verifiedEmployeeId && !target.onBehalf && !employee.selfieExempt && (company?.selfieRequired || employee.workSchedule?.requireSelfieOnClockIn)
  if (selfieRequired && !preParsed.data.photo) return NextResponse.json({ error: 'Capture a selfie to clock out.' }, { status: 400 })
  let clockOutPhoto: string | null = null
  if (preParsed.data.photo) {
    try { clockOutPhoto = await normalizeActivityPhoto(preParsed.data.photo) }
    catch { return NextResponse.json({ error: 'Invalid selfie. Please capture a new photo.' }, { status: 400 }) }
  }
  const existing = activeOpenRecords[0]
  if (!existing) {
    return NextResponse.json({ error: 'No active clock-in record found' }, { status: 409 })
  }
  if (!existing.timeIn) {
    return NextResponse.json({ error: 'No active clock-in record found' }, { status: 409 })
  }

  const attendance = await resolveAttendanceLocation(ctx.companyId, employee.id, existing.timeIn, existing.date)
  attendance.policy = savedGeofence(existing.attendanceLocation) ?? attendance.policy
  const locationFailure = locationError(attendance.policy, lat, lng)
  if (locationFailure) return NextResponse.json({ error: locationFailure }, { status: 403 })

  // A DTR is one shift. If a desktop session remains open for multiple days,
  // preserve the user's clock-out time-of-day but collapse extra whole days
  // instead of persisting a multi-day attendance span into payroll.
  const effectiveClockOut = normalizeSingleShiftTimeOut(existing.timeIn, now)
  const normalizedStaleShift = effectiveClockOut.getTime() !== now.getTime()

  let breakOutTime: Date | null = null
  let effectiveBreakIn: Date | null = null
  let effectiveBreakOut: Date | null = null
  if (existing.breakIn && existing.breakIn >= existing.timeIn && existing.breakIn <= effectiveClockOut) {
    effectiveBreakIn = existing.breakIn
    const candidateBreakOut = existing.breakOut ?? effectiveClockOut
    effectiveBreakOut = candidateBreakOut <= effectiveClockOut ? candidateBreakOut : effectiveClockOut
    breakOutTime = effectiveBreakOut
  }
  // Resolve the employee's scheduled start/end + allowed break BEFORE computing
  // hours so the planned shift duration can be used as the regular-hours cap.
  // The shared resolver picks the per-date assignment closest to actual clock-in
  // for multi-shift days, falling back to the fixed schedule otherwise.
  const resolved = halfDayWorkedShift(await resolveShiftForDtr({
    employeeId: employee.id,
    date: existing.date,
    actualTimeIn: existing.timeIn,
    employee: {
      workScheduleId: employee.workScheduleId,
      workSchedule: employee.workSchedule
        ? {
            timezone: employee.workSchedule.timezone,
            timeIn: employee.workSchedule.timeIn ?? null,
            timeOut: employee.workSchedule.timeOut ?? null,
            breakMinutes: employee.workSchedule.breakMinutes ?? null,
          }
        : null,
    },
    defaultBreakMinutes: companyDefaultBreakMinutes,
  }), existing)
  const plannedRegularMins = resolved.plannedRegularMinutes
  const ndWindow = await getCompanyNightDiffWindow(ctx.companyId)

  const computed = computeHours(
    existing.timeIn,
    effectiveClockOut,
    effectiveBreakIn,
    effectiveBreakOut,
    {
      plannedRegularMinutes: plannedRegularMins,
      allowedBreakMinutes: resolved.allowedBreakMinutes,
      nightDiffStartMins: ndWindow.startMins,
      nightDiffEndMins: ndWindow.endMins,
      nightDiffIncludesBreak: ndWindow.includesBreak,
      scheduledStart: resolved.scheduledStart, scheduledEnd: resolved.scheduledEnd, scheduledTimeIn: resolved.scheduleTimeIn,
      scheduledTimeOut: resolved.scheduleTimeOut,
    },
  )
  // Preserve worked OT even when company pay is disabled; approval and payroll
  // remain gated, while the raw value can later be converted for one employee.
  const regularHours = computed.regularHours
  const overtimeHours = computed.overtimeHours
  const nightDiffHours = computed.nightDiffHours

  const { lateMinutes: baseLateMinutes, undertimeMinutes: computedUndertime } = computeLateAndUndertime(
    existing.timeIn,
    effectiveClockOut,
    resolved.scheduleTimeIn,
    resolved.scheduleTimeOut, resolved)

  const overBreakMinutes = computeOverBreakMinutes(effectiveBreakIn, effectiveBreakOut, resolved.allowedBreakMinutes)
  const lateMinutes = existing.isRestDay ? 0 : baseLateMinutes + overBreakMinutes
  const undertimeMinutes = existing.isRestDay ? 0 : computedUndertime

  const staleOpenRecords = activeOpenRecords.slice(1)
  const staleOpenCount = staleOpenRecords.length

  let record: Awaited<ReturnType<typeof prisma.dTRRecord.update>>
  try { record = await prisma.$transaction(async (tx) => {
    const updatedPrimary = await tx.dTRRecord.update({
      where: { id: existing.id,timeOut:null },
      data: {
        timeOut: effectiveClockOut,
        clockOutPhoto,
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
        ...(normalizedStaleShift ? {
          remarks: existing.remarks
            ? `${existing.remarks}\n[System] Multi-day open shift normalized on clock-out (${now.toISOString()}).`
            : `[System] Multi-day open shift normalized on clock-out (${now.toISOString()}).`,
        } : {}),
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
            clockOutPhoto,
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

  const geofenceOut = hasLocation && attendance.policy.enabled ? !(geofenceStatus(attendance.policy, lat!, lng!)?.inside ?? false) : null

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
  const { clockInPhoto: _photo, breakInPhoto: _breakInPhoto, breakOutPhoto: _breakOutPhoto, clockOutPhoto: _clockOutPhoto, ...safeRecord } = record
  return NextResponse.json({
    record: safeRecord,
    message: staleOpenCount > 0
      ? `Clocked out successfully (also auto-closed ${staleOpenCount} duplicate active shift${staleOpenCount > 1 ? 's' : ''}).`
      : 'Clocked out successfully',
    geofenceWarning,
    staleOpenAutoClosed: staleOpenCount,
  })
}
