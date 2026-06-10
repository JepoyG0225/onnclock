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

// /api/locations/ping is fired every 3 minutes by every clocked-in
// employee. A single slow Prisma call (pool exhaustion during a burst,
// brief Supabase pause, etc.) would normally throw and Vercel returns
// an empty 500 — which we then saw in the wild. To keep the ping path
// resilient, every query gets a 3-second hard timeout AND the whole
// handler is wrapped so any unexpected throw still yields a JSON 500
// with a useful error message instead of a blank response body.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms}ms): ${label}`)), ms),
    ),
  ])
}

export async function POST(req: NextRequest) {
  try {
    // Pass req so Bearer tokens from the desktop app are accepted
    const { ctx, error } = await requireAuth(undefined, req)
    if (error) return error

    const employee = await withTimeout(
      prisma.employee.findFirst({
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
      }),
      3000,
      'employee.findFirst',
    )
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const body = await req.json()
    const parsed = pingSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { lat, lng, accuracy } = parsed.data

    // Only accept pings if employee is currently clocked in
    const manilaDate = getManilaDateOnly()
    const dtrRecord = await withTimeout(
      prisma.dTRRecord.findFirst({
        where: {
          employeeId: employee.id,
          date: manilaDate,
          timeIn: { not: null },
          timeOut: null, // still clocked in
        },
      }),
      3000,
      'dTRRecord.findFirst',
    )

    if (!dtrRecord) {
      return NextResponse.json({ error: 'Not currently clocked in' }, { status: 400 })
    }

    const ping = await withTimeout(
      prisma.locationPing.create({
        data: {
          employeeId: employee.id,
          dtrRecordId: dtrRecord.id,
          lat,
          lng,
          accuracy,
        },
      }),
      3000,
      'locationPing.create',
    )

    const company = await withTimeout(
      prisma.company.findUnique({
        where: { id: ctx.companyId },
        select: { geofenceEnabled: true, geofenceLat: true, geofenceLng: true, geofenceRadiusMeters: true },
      }),
      3000,
      'company.findUnique',
    ).catch(() => null) // Geofence eval is non-essential — degrade silently
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

    // Live-map broadcast is best-effort — wrap so an exception in the
    // optional WS hook can't take down the ping itself.
    try {
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
    } catch (broadcastErr) {
      console.error('[locations/ping] broadcast failed (non-fatal):', broadcastErr)
    }

    return NextResponse.json({ ping })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[locations/ping] handler crash:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
