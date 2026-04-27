import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { getManilaDateOnly } from '@/lib/date-manila'

const pingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
})

export async function POST(req: NextRequest) {
  // Pass req so Bearer tokens from the desktop app are accepted
  const { ctx, error } = await requireAuth(undefined, req)
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
  const parsed = pingSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { lat, lng, accuracy } = parsed.data

  // Only accept pings if employee is currently clocked in
  const manilaDate = getManilaDateOnly()
  const dtrRecord = await prisma.dTRRecord.findFirst({
    where: {
      employeeId: employee.id,
      date: manilaDate,
      timeIn: { not: null },
      timeOut: null, // still clocked in
    },
  })

  if (!dtrRecord) {
    return NextResponse.json({ error: 'Not currently clocked in' }, { status: 400 })
  }

  const ping = await prisma.locationPing.create({
    data: {
      employeeId: employee.id,
      dtrRecordId: dtrRecord.id,
      lat,
      lng,
      accuracy,
    },
  })

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { geofenceEnabled: true, geofenceLat: true, geofenceLng: true, geofenceRadiusMeters: true },
  })
  let geofenceOut: boolean | null = null
  if (
    company?.geofenceEnabled &&
    company.geofenceLat != null &&
    company.geofenceLng != null &&
    company.geofenceRadiusMeters != null
  ) {
    const toRad = (d: number) => (d * Math.PI) / 180
    const R = 6371000
    const dLat = toRad(lat - company.geofenceLat)
    const dLng = toRad(lng - company.geofenceLng)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(company.geofenceLat)) * Math.cos(toRad(lat)) *
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
      clockInTime: dtrRecord.timeIn,
      clockOutTime: dtrRecord.timeOut,
      clockInAddress: dtrRecord.clockInAddress,
      isClockedIn: true,
      geofenceOut,
      lastPing: {
        lat: ping.lat,
        lng: ping.lng,
        accuracy: ping.accuracy,
        recordedAt: ping.recordedAt,
      },
    },
  })

  return NextResponse.json({ ping })
}
