import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const clockInSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
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
      workSchedule: { select: { requireSelfieOnClockIn: true } },
      department: { select: { name: true } },
      position: { select: { title: true } },
    },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const body = await req.json()
  const parsed = clockInSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { lat, lng, accuracy, address, photo } = parsed.data
  if (employee.workSchedule?.requireSelfieOnClockIn && !photo) {
    return NextResponse.json({ error: 'Selfie is required before clocking in for your schedule' }, { status: 400 })
  }
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
        return NextResponse.json({ error: 'Outside allowed area for clock in' }, { status: 403 })
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

  // Check if already clocked in today
  const existing = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, date: manilaDate },
  })
  if (existing?.timeIn) {
    return NextResponse.json({ error: 'Already clocked in today' }, { status: 409 })
  }

  // Check for holiday
  const holiday = await prisma.holiday.findFirst({
    where: {
      companyId: ctx.companyId,
      date: manilaDate,
    },
  })

  const record = existing
    ? await prisma.dTRRecord.update({
        where: { id: existing.id },
        data: {
          timeIn: now,
          source: 'GPS',
          clockInLat: lat,
          clockInLng: lng,
          clockInAccuracy: accuracy,
          clockInAddress: address,
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
          source: 'GPS',
          clockInLat: lat,
          clockInLng: lng,
          clockInAccuracy: accuracy,
          clockInAddress: address,
          clockInPhoto: photo ?? null,
          isHoliday: !!holiday,
          holidayType: holiday?.type ?? null,
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

  // Save initial location ping
  await prisma.locationPing.create({
    data: {
      employeeId: employee.id,
      dtrRecordId: record.id,
      lat,
      lng,
      accuracy,
    },
  })

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
      lastPing: {
        lat,
        lng,
        accuracy: accuracy ?? null,
        recordedAt: new Date(),
      },
    },
  })

  return NextResponse.json({ record, message: 'Clocked in successfully', geofenceWarning })
}
