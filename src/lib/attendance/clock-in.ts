import { leaveClockInError, workedHalfPeriod } from './half-day-leave'
import { createNotificationsForUsers } from '@/lib/notifications'
import { NextRequest, NextResponse } from 'next/server'
import type { AuthContext } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasScreenCaptureFeature, isDesktopApp } from '@/lib/feature-gates'
import { resolvePunchEmployeeId } from '@/lib/attendance/punch-target'
import { getManilaDateString } from '@/lib/date-manila'
import { resolveAttendanceLocation } from '@/lib/attendance/schedule-location'
import { locationError, geofenceStatus } from '@/lib/attendance/location-policy'
import { z } from 'zod'

const clockInSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().optional(),
  address: z.string().optional(),
  photo: z.string().optional(), // base64 data URL from face verification frame
  /**
   * Punch on behalf of this employee. Only honoured for callers holding
   * dtr:write — the shared face-recognition kiosk, which has no signed-in
   * employee of its own. Ignored (and rejected) for everyone else.
   */
  employeeId: z.string().optional(),
})

function isMobileUserAgent(ua: string): boolean {
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function getManilaMinutes(base: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(base)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

function normalizeWorkDays(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is number => typeof v === 'number' && v >= 0 && v <= 6)
}

export async function canAttendToday(params: {
  companyId: string
  employeeId: string
  workScheduleId: string | null
  fixedWorkDays: number[]
  manilaDate: Date
  dateStr: string
  dayOfWeek: number
}) {
  const { companyId, employeeId, workScheduleId, fixedWorkDays, manilaDate, dayOfWeek } = params

  // Look up ALL shift assignments for today — supports multiple shifts per day.
  const assignmentsToday = await prisma.employeeShiftAssignment.findMany({
    where: { companyId, employeeId, date: manilaDate },
    select: { scheduleId: true, timeIn: true, timeOut: true, isRestDay: true },
  })

  // Any single non-rest-day assignment counts as a work day
  const hasWorkShift = assignmentsToday.some(
    a => !a.isRestDay && (!!a.scheduleId || (!!a.timeIn && !!a.timeOut))
  )
  const allMarkedRestDay =
    assignmentsToday.length > 0 && assignmentsToday.every(a => a.isRestDay)

  if (allMarkedRestDay) return { allowed: true, restDay: true, message: 'Rest-day shift requires HR approval.' }

  if (workScheduleId) {
    // Fixed schedule employee: allowed on their scheduled work days OR when an
    // explicit shift assignment overrides a rest day (e.g. admin plots extra work day).
    const scheduledWorkDay = Array.isArray(fixedWorkDays) && fixedWorkDays.includes(dayOfWeek)
    if (scheduledWorkDay || hasWorkShift) {
      return { allowed: true, message: null as string | null }
    }
    if (allMarkedRestDay) {
      return { allowed: false, message: 'Today is marked as rest day in your schedule.' }
    }
    return { allowed: true, restDay: true, message: 'Rest-day shift requires HR approval.' }
  }

  // Flexible employee: must have at least one non-rest-day assignment today.
  if (assignmentsToday.length === 0) {
    return { allowed: false, message: 'No flexible schedule is set for today. You cannot clock in.' }
  }
  if (allMarkedRestDay) {
    return { allowed: false, message: 'Today is marked as rest day in your flexible schedule.' }
  }
  if (!hasWorkShift) {
    return { allowed: false, message: 'No flexible schedule is set for today. You cannot clock in.' }
  }
  return { allowed: true, message: null as string | null }
}

export async function performClockIn(req: NextRequest, ctx: AuthContext, officeKiosk = false, verifiedEmployeeId?: string) {

  // Parsed up front because the target employee can now come from the body.
  const rawBody = await req.json()
  const preParsed = clockInSchema.safeParse(rawBody)
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
      selfieExempt: true,
      geofenceExempt: true,
      workScheduleId: true,
      workSchedule: { select: { requireSelfieOnClockIn: true, workDays: true, timeIn: true, timeOut: true } },
      department: { select: { name: true } },
      position: { select: { title: true } },
    },
  }) : null
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const parsed = preParsed

  const { lat, lng, accuracy, address, photo } = parsed.data
  const hasLocation = lat != null && lng != null
  const [companyPolicy, sub] = await Promise.all([
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: {
        geofenceEnabled: true,
        geofenceLat: true,
        geofenceLng: true,
        geofenceRadiusMeters: true,
        selfieRequired: true,
        screenCaptureEnabled: true,
      },
    }),
    getCompanySubscription(ctx.companyId),
  ])
  const ua  = req.headers.get('user-agent') ?? ''

  const screenCaptureActive =
    (companyPolicy?.screenCaptureEnabled ?? false) &&
    hasScreenCaptureFeature(sub.pricePerSeat, sub.isTrial)

  // Browser clock-in is blocked when screen monitoring is enforced so
  // capture starts at the very beginning of the shift. TRIAL companies
  // get a pass: they may be evaluating screen monitoring without the
  // desktop app rolled out yet, so we allow portal clock-in (mobile or
  // browser) without forcing the desktop install during evaluation.
  if (screenCaptureActive && !sub.isTrial) {
    if (isMobileUserAgent(ua)) {
      return NextResponse.json(
        { error: 'Screen monitoring is enabled. You can only clock in on a laptop or desktop device.' },
        { status: 403 }
      )
    }
    if (!isDesktopApp(ua)) {
      return NextResponse.json(
        { error: 'Screen monitoring is enabled for your company. Please use the OnClock Desktop app to clock in.', desktopRequired: true },
        { status: 403 }
      )
    }
  }

  const selfieRequired =
    !employee.selfieExempt &&
    ((companyPolicy?.selfieRequired ?? false) || !!employee.workSchedule?.requireSelfieOnClockIn)
  if (selfieRequired && !photo) {
    return NextResponse.json({ error: 'Selfie is required before clocking in' }, { status: 400 })
  }

  const geofenceWarning: string | null = null
  const now = new Date()
  const scheduleTimeInMins = parseTimeToMinutes(employee.workSchedule?.timeIn)
  const scheduleTimeOutMins = parseTimeToMinutes(employee.workSchedule?.timeOut)
  const hasOvernightFixedSchedule =
    scheduleTimeInMins != null &&
    scheduleTimeOutMins != null &&
    scheduleTimeOutMins <= scheduleTimeInMins
  const nowManilaMins = getManilaMinutes(now)
  const overnightClockInWindowEnd =
    scheduleTimeOutMins != null ? Math.min(24 * 60 - 1, scheduleTimeOutMins + 6 * 60) : null
  const shouldUsePreviousDayForNightShift =
    !!hasOvernightFixedSchedule &&
    overnightClockInWindowEnd != null &&
    nowManilaMins <= overnightClockInWindowEnd
  const attendanceBase = shouldUsePreviousDayForNightShift
    ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
    : now

  const attendance = await resolveAttendanceLocation(ctx.companyId, employee.id, now)
  const locationFailure = locationError(attendance.policy, lat, lng)
  if (locationFailure) return NextResponse.json({ error: locationFailure }, { status: 403 })
  const manilaDate = attendance.date
  const dateStr = attendance.date.toISOString().slice(0,10)
  const dayOfWeek = manilaDate.getUTCDay()
  const dayEligibility = await canAttendToday({
    companyId: ctx.companyId,
    employeeId: employee.id,
    workScheduleId: employee.workScheduleId ?? null,
    fixedWorkDays: normalizeWorkDays(employee.workSchedule?.workDays),
    manilaDate,
    dateStr,
    dayOfWeek,
  })
  if (!dayEligibility.allowed) {
    return NextResponse.json({ error: dayEligibility.message }, { status: 403 })
  }

  // Block new clock-in only if there is an active (not yet clocked out) shift.
  // Multi-shift per day is supported: completed DTR rows for the same date no
  // longer block the next clock-in (one row per shift).
  const activeOpenRecord = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null },
    orderBy: { timeIn: 'desc' },
  })
  if (activeOpenRecord) {
    return NextResponse.json({ error: 'You still have an active shift. Please clock out first.' }, { status: 409 })
  }

  // One-time correction: if today's most recent record is a closed overnight
  // shift wrongly saved under today's date (an artifact from a prior bug),
  // move it back to the previous day so it doesn't get confused with the
  // fresh shift the employee is starting now.
  const existingToday = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, date: manilaDate, timeIn: { not: null }, timeOut: { not: null } },
    orderBy: { timeIn: 'desc' },
  })
  if (
    (attendance.schedule?.timezone??'Asia/Manila')==='Asia/Manila' &&
    existingToday?.timeIn &&
    existingToday.timeOut &&
    hasOvernightFixedSchedule &&
    !shouldUsePreviousDayForNightShift &&
    scheduleTimeOutMins != null &&
    scheduleTimeInMins != null &&
    nowManilaMins >= scheduleTimeInMins
  ) {
    const existingTimeInMins = getManilaMinutes(existingToday.timeIn)
    const looksLikeAfterMidnightShift = existingTimeInMins <= Math.min(24 * 60 - 1, scheduleTimeOutMins + 6 * 60)
    if (looksLikeAfterMidnightShift) {
      const previousDayDate = new Date(manilaDate)
      previousDayDate.setDate(previousDayDate.getDate() - 1)
      const previousDayRecord = await prisma.dTRRecord.findFirst({
        where: { employeeId: employee.id, date: previousDayDate },
      })
      if (!previousDayRecord) {
        await prisma.dTRRecord.update({
          where: { id: existingToday.id },
          data: { date: previousDayDate },
        })
      }
    }
  }

  const [onLeave, holiday, reusableDraftToday] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        status: 'APPROVED',
        startDate: { lte: manilaDate },
        endDate:   { gte: manilaDate },
      },
      select: { id: true, isHalfDay: true, halfDayPeriod: true, leaveType: { select: { name: true } } },
    }),
    prisma.holiday.findFirst({
      where: { companyId: ctx.companyId, date: manilaDate },
    }),
    prisma.dTRRecord.findFirst({
      where: { employeeId: employee.id, date: manilaDate, timeIn: null, timeOut: null, isLeave: false },
    }),
  ])

  const leaveError = leaveClockInError(onLeave, now, manilaDate, { ...attendance.schedule, timeIn: attendance.shiftTimeIn ?? attendance.schedule?.timeIn, timeOut: attendance.shiftTimeOut ?? attendance.schedule?.timeOut })
  if (leaveError) return NextResponse.json({ error: leaveError }, { status: 403 })
  const halfDayPeriod = workedHalfPeriod(onLeave)
  const workedLeaveFields = halfDayPeriod ? { isHalfDay: true, halfDayPeriod, isLeave: false, isLeavePaid: false, isAbsent: false, leaveRequestId: null } : {}

  const source = officeKiosk ? 'BIOMETRIC' : isDesktopApp(ua) ? 'DESKTOP' : 'GPS'
  let record: Awaited<ReturnType<typeof prisma.dTRRecord.create>>
  try {
    record = reusableDraftToday
      ? await prisma.dTRRecord.update({
          where: { id: reusableDraftToday.id },
          data: {
            timeIn: now,
            ...workedLeaveFields,
            attendanceLocation: attendance.policy,
            source,
            clockInLat: lat ?? null,
            clockInLng: lng ?? null,
            clockInAccuracy: accuracy ?? null,
            clockInAddress: address ?? null,
            clockInPhoto: photo ?? null,
            isRestDay: dayEligibility.restDay === true,
            restDayApproval: dayEligibility.restDay ? 'PENDING' : null,
            restDayReviewedBy: null, restDayReviewedAt: null, restDayReviewNote: null,
            approvedBy: null,
            isHoliday: !!holiday,
            holidayType: holiday?.type ?? null,
          },
        })
      : await prisma.dTRRecord.create({
          data: {
            employeeId: employee.id,
            date: manilaDate,
            timeIn: now,
            ...workedLeaveFields,
            attendanceLocation: attendance.policy,
            source,
            clockInLat: lat ?? null,
            clockInLng: lng ?? null,
            clockInAccuracy: accuracy ?? null,
            clockInAddress: address ?? null,
            clockInPhoto: photo ?? null,
            isRestDay: dayEligibility.restDay === true,
            restDayApproval: dayEligibility.restDay ? 'PENDING' : null,
            restDayReviewedBy: null, restDayReviewedAt: null, restDayReviewNote: null,
            approvedBy: null,
            isHoliday: !!holiday,
            holidayType: holiday?.type ?? null,
          },
        })
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code
    if (code === 'P2002') {
      return NextResponse.json({ error: 'Already clocked in today' }, { status: 409 })
    }
    if (code === 'P2025') {
      return NextResponse.json({ error: 'Clock-in record was not found. Please try again.' }, { status: 409 })
    }
    throw e
  }

  if (dayEligibility.restDay) {
    try {
      const reviewers = await prisma.userCompany.findMany({ where: { companyId: ctx.companyId, isActive: true, user: { isActive: true }, role: { in: ['COMPANY_ADMIN', 'HR_MANAGER'] } }, select: { userId: true } })
      await createNotificationsForUsers(reviewers.map(r => r.userId), { companyId: ctx.companyId, type: 'GENERIC', title: 'Rest-day shift approval requested', body: `${employee.firstName} ${employee.lastName} clocked in on a scheduled rest day.`, link: '/attendance?restDayRequest=' + record.id })
    } catch (error) { console.error('Rest-day notification failed', error) }
  }

  const geofenceOut = hasLocation && attendance.policy.enabled ? !(geofenceStatus(attendance.policy, lat!, lng!)?.inside ?? false) : null

  // Save initial location ping (only if location was provided)
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
      clockInPhoto: record.clockInPhoto ?? null,
      isClockedIn: true,
      geofenceOut,
      lastPing: hasLocation ? {
        lat: lat!,
        lng: lng!,
        accuracy: accuracy ?? null,
        recordedAt: new Date(),
      } : null,
    },
  })

  // Strip clockInPhoto from response — it can be several MB of base64 data and
  // is not consumed by any client.  Large payloads can exceed Vercel's response
  // size limit and cause the browser to report "Failed to fetch".
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { clockInPhoto: _photo, breakInPhoto: _breakInPhoto, breakOutPhoto: _breakOutPhoto, clockOutPhoto: _clockOutPhoto, ...safeRecord } = record
  return NextResponse.json({ record: safeRecord, message: dayEligibility.restDay ? 'Clocked in. Your rest-day shift is awaiting HR approval.' : 'Clocked in successfully', geofenceWarning })
}
