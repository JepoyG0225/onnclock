import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { differenceInMinutes } from 'date-fns'

const clockOutSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  address: z.string().optional(),
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

function computeHours(timeIn: Date, timeOut: Date, breakMinutes = 0) {
  const totalMinutes = differenceInMinutes(timeOut, timeIn)
  const workedMinutes = Math.max(0, totalMinutes - breakMinutes)
  const regularMinutes = Math.min(workedMinutes, 8 * 60) // 8 hours standard
  const overtimeMinutes = Math.max(0, workedMinutes - 8 * 60)

  // Night diff: 10PM–6AM
  let nightDiffMinutes = 0
  let cursor = new Date(timeIn)
  while (cursor < timeOut) {
    const h = cursor.getHours()
    if (h >= 22 || h < 6) nightDiffMinutes++
    cursor = new Date(cursor.getTime() + 60_000)
  }

  return {
    regularHours: Math.round((regularMinutes / 60) * 100) / 100,
    overtimeHours: Math.round((overtimeMinutes / 60) * 100) / 100,
    nightDiffHours: Math.round((nightDiffMinutes / 60) * 100) / 100,
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNo: true,
      photoUrl: true,
      department: { select: { name: true } },
      position: { select: { title: true } },
    },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const body = await req.json()
  const parsed = clockOutSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { lat, lng, accuracy, address } = parsed.data
  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { geofenceEnabled: true, geofenceLat: true, geofenceLng: true, geofenceRadiusMeters: true },
  })
  let geofenceWarning: string | null = null
  if (company?.geofenceEnabled) {
    if (
      company.geofenceLat == null ||
      company.geofenceLng == null ||
      company.geofenceRadiusMeters == null
    ) {
      geofenceWarning = 'Geo-fence is enabled but not configured'
    } else {
      const dist = distanceMeters(lat, lng, company.geofenceLat, company.geofenceLng)
      if (dist > company.geofenceRadiusMeters) {
        return NextResponse.json({ error: 'Outside allowed area for clock out' }, { status: 403 })
      }
    }
  }
  const now = new Date()
  const manilaOffsetMs = 8 * 60 * 60 * 1000
  const manila = new Date(now.getTime() + manilaOffsetMs)
  const yyyy = manila.getUTCFullYear()
  const mm = String(manila.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(manila.getUTCDate()).padStart(2, '0')
  const manilaDate = new Date(`${yyyy}-${mm}-${dd}`)

  const existing = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, date: manilaDate },
  })

  if (!existing?.timeIn) {
    return NextResponse.json({ error: 'Not clocked in yet today' }, { status: 409 })
  }
  if (existing.timeOut) {
    return NextResponse.json({ error: 'Already clocked out today' }, { status: 409 })
  }

  let breakMinutes = 0
  let breakOutTime: Date | null = null
  if (existing.breakIn) {
    const effectiveBreakOut = existing.breakOut ?? now
    breakMinutes = Math.max(0, differenceInMinutes(effectiveBreakOut, existing.breakIn))
    breakOutTime = existing.breakOut ?? now
  }
  const { regularHours, overtimeHours, nightDiffHours } = computeHours(existing.timeIn, now, breakMinutes)

  // Compute late minutes against schedule start (default 08:00)
  const scheduleStart = new Date(existing.timeIn)
  scheduleStart.setHours(8, 0, 0, 0)
  const lateMinutes = existing.timeIn > scheduleStart
    ? Math.max(0, differenceInMinutes(existing.timeIn, scheduleStart))
    : 0

  const record = await prisma.dTRRecord.update({
    where: { id: existing.id },
    data: {
      timeOut: now,
      clockOutLat: lat,
      clockOutLng: lng,
      clockOutAccuracy: accuracy,
      clockOutAddress: address,
      breakOut: breakOutTime ?? undefined,
      regularHours,
      overtimeHours,
      nightDiffHours,
      lateMinutes,
    },
  })

  // Final location ping
  await prisma.locationPing.create({
    data: {
      employeeId: employee.id,
      dtrRecordId: record.id,
      lat,
      lng,
      accuracy,
    },
  })

  const companyGeo = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { geofenceEnabled: true, geofenceLat: true, geofenceLng: true, geofenceRadiusMeters: true },
  })
  let geofenceOut: boolean | null = null
  if (
    companyGeo?.geofenceEnabled &&
    companyGeo.geofenceLat != null &&
    companyGeo.geofenceLng != null &&
    companyGeo.geofenceRadiusMeters != null
  ) {
    const toRad = (d: number) => (d * Math.PI) / 180
    const R = 6371000
    const dLat = toRad(lat - companyGeo.geofenceLat)
    const dLng = toRad(lng - companyGeo.geofenceLng)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(companyGeo.geofenceLat)) * Math.cos(toRad(lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const dist = R * c
    geofenceOut = dist > companyGeo.geofenceRadiusMeters
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
      lastPing: {
        lat,
        lng,
        accuracy: accuracy ?? null,
        recordedAt: new Date(),
      },
    },
  })

  return NextResponse.json({ record, message: 'Clocked out successfully', geofenceWarning })
}
