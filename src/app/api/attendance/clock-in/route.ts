import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasScreenCaptureFeature, isDesktopApp } from '@/lib/feature-gates'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'
import { getManilaDateOnly, getManilaDateString, getManilaDayOfWeek } from '@/lib/date-manila'
import { z } from 'zod'

const clockInSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().optional(),
  address: z.string().optional(),
  photo: z.string().optional(), // base64 data URL from face verification frame
})

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

async function canAttendToday(params: {
  companyId: string
  employeeId: string
  workScheduleId: string | null
  fixedWorkDays: number[]
  manilaDate: Date
  dateStr: string
  dayOfWeek: number
}) {
  const { companyId, employeeId, workScheduleId, fixedWorkDays, manilaDate, dayOfWeek } = params

  // Always look up today's shift assignment — it acts as an override/exception
  // for both fixed-schedule and flexible employees.
  const assignment = await prisma.employeeShiftAssignment.findFirst({
    where: { companyId, employeeId, date: manilaDate },
    select: { scheduleId: true, timeIn: true, timeOut: true, isRestDay: true },
  })

  const assignmentIsWorkDay =
    !!assignment &&
    !assignment.isRestDay &&
    (!!assignment.scheduleId || (!!assignment.timeIn && !!assignment.timeOut))

  if (workScheduleId) {
    // Fixed schedule employee: allowed on their scheduled work days OR when an
    // explicit shift assignment overrides a rest day (e.g. admin plots extra work day).
    const scheduledWorkDay = Array.isArray(fixedWorkDays) && fixedWorkDays.includes(dayOfWeek)
    if (scheduledWorkDay || assignmentIsWorkDay) {
      return { allowed: true, message: null as string | null }
    }
    // Explicit rest-day assignment blocks even if schedule would otherwise allow it
    if (assignment?.isRestDay) {
      return { allowed: false, message: 'Today is marked as rest day in your schedule.' }
    }
    return { allowed: false, message: 'Today is your rest day based on your fixed schedule.' }
  }

  // Flexible employee: must have a non-rest-day assignment today.
  if (!assignment) {
    return { allowed: false, message: 'No flexible schedule is set for today. You cannot clock in.' }
  }
  if (assignment.isRestDay) {
    return { allowed: false, message: 'Today is marked as rest day in your flexible schedule.' }
  }
  const hasSchedule = !!assignment.scheduleId || (!!assignment.timeIn && !!assignment.timeOut)
  if (!hasSchedule) {
    return { allowed: false, message: 'No flexible schedule is set for today. You cannot clock in.' }
  }
  return { allowed: true, message: null as string | null }
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
      selfieExempt: true,
      geofenceExempt: true,
      workScheduleId: true,
      workSchedule: { select: { requireSelfieOnClockIn: true, workDays: true, timeIn: true, timeOut: true } },
      department: { select: { name: true } },
      position: { select: { title: true } },
    },
  }) : null
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const body = await req.json()
  const parsed = clockInSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

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

  if (screenCaptureActive) {
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

  const geofenceEnabled = (companyPolicy?.geofenceEnabled ?? false) && !employee.geofenceExempt
  let geofenceWarning: string | null = null
  if (geofenceEnabled && hasLocation) {
    if (
      companyPolicy?.geofenceLat == null ||
      companyPolicy.geofenceLng == null ||
      companyPolicy.geofenceRadiusMeters == null
    ) {
      geofenceWarning = 'Geo-fence is enabled but not configured'
    } else {
      const dist = distanceMeters(lat!, lng!, companyPolicy.geofenceLat, companyPolicy.geofenceLng)
      if (dist > companyPolicy.geofenceRadiusMeters) {
        return NextResponse.json({ error: 'Outside allowed area for clock in' }, { status: 403 })
      }
    }
  }
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

  const manilaDate = getManilaDateOnly(attendanceBase)
  const dateStr = getManilaDateString(attendanceBase)
  const dayOfWeek = getManilaDayOfWeek(attendanceBase)
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

  // Block new clock-in if there is an active (not yet clocked out) attendance record,
  // including overnight shifts that started on the previous date.
  const activeOpenRecord = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null },
    orderBy: { timeIn: 'desc' },
  })
  if (activeOpenRecord) {
    return NextResponse.json({ error: 'You still have an active shift. Please clock out first.' }, { status: 409 })
  }

  const existingToday = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, date: manilaDate },
  })

  if (existingToday?.timeIn && existingToday.timeOut) {
    // One-time correction for overnight records previously saved under the wrong date.
    if (
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

    const freshConflictCheck = await prisma.dTRRecord.findFirst({
      where: { employeeId: employee.id, date: manilaDate, timeIn: { not: null } },
    })
    if (freshConflictCheck) {
      return NextResponse.json({ error: 'Already clocked in today' }, { status: 409 })
    }
  }

  const [onLeave, holiday, reusableDraftToday] = await Promise.all([
    prisma.leaveRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: 'APPROVED',
        startDate: { lte: manilaDate },
        endDate:   { gte: manilaDate },
      },
      select: { id: true, leaveType: { select: { name: true } } },
    }),
    prisma.holiday.findFirst({
      where: { companyId: ctx.companyId, date: manilaDate },
    }),
    prisma.dTRRecord.findFirst({
      where: { employeeId: employee.id, date: manilaDate, timeIn: null, timeOut: null },
    }),
  ])

  if (onLeave) {
    return NextResponse.json(
      { error: `You are on approved ${onLeave.leaveType.name} leave today and cannot clock in.` },
      { status: 403 }
    )
  }

  const source = isDesktopApp(ua) ? 'DESKTOP' : 'GPS'
  const record = reusableDraftToday
    ? await prisma.dTRRecord.update({
        where: { id: reusableDraftToday.id },
        data: {
          timeIn: now,
          source,
          clockInLat: lat ?? null,
          clockInLng: lng ?? null,
          clockInAccuracy: accuracy ?? null,
          clockInAddress: address ?? null,
          clockInPhoto: photo ?? null,
          isHoliday: !!holiday,
          holidayType: holiday?.type ?? null,
        },
      })
    : await prisma.dTRRecord.create({
        data: {
          employeeId: employee.id,
          date: manilaDate,
          timeIn: now,
          source,
          clockInLat: lat ?? null,
          clockInLng: lng ?? null,
          clockInAccuracy: accuracy ?? null,
          clockInAddress: address ?? null,
          clockInPhoto: photo ?? null,
          isHoliday: !!holiday,
          holidayType: holiday?.type ?? null,
        },
      })

  let geofenceOut: boolean | null = null
  if (
    hasLocation &&
    geofenceEnabled &&
    companyPolicy?.geofenceLat != null &&
    companyPolicy.geofenceLng != null &&
    companyPolicy.geofenceRadiusMeters != null
  ) {
    const toRad = (d: number) => (d * Math.PI) / 180
    const R = 6371000
    const dLat = toRad(lat! - companyPolicy.geofenceLat)
    const dLng = toRad(lng! - companyPolicy.geofenceLng)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(companyPolicy.geofenceLat)) * Math.cos(toRad(lat!)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const dist = R * c
    geofenceOut = dist > companyPolicy.geofenceRadiusMeters
  }

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

  return NextResponse.json({ record, message: 'Clocked in successfully', geofenceWarning })
}
