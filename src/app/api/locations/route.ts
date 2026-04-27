import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getManilaDateOnly } from '@/lib/date-manila'

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

// Returns the last known location for each employee currently clocked in (today)
export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const clockedInOnly = searchParams.get('clockedInOnly') === '1'

  const manilaDate = getManilaDateOnly()
  const manilaDateNext = new Date(manilaDate)
  manilaDateNext.setUTCDate(manilaDateNext.getUTCDate() + 1)

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { geofenceEnabled: true, geofenceLat: true, geofenceLng: true, geofenceRadiusMeters: true },
  })

  // Get all employees clocked in today.
  // When clockedInOnly, skip the date filter so overnight/nightshift employees
  // whose DTR is dated yesterday but still have an open shift are included.
  const activeDTR = await prisma.dTRRecord.findMany({
    where: {
      employee: { companyId: ctx.companyId },
      timeIn: { not: null },
      ...(clockedInOnly
        ? { timeOut: null }
        : { date: { gte: manilaDate, lt: manilaDateNext } }),
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          photoUrl: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
    },
  })

  if (activeDTR.length === 0) return NextResponse.json({ locations: [] })

  // For each active DTR, get the most recent location ping
  const employeeIds = activeDTR.map(r => r.employeeId)

  // Get the latest ping per employee (avoid loading full ping history)
  const latestPings = await prisma.locationPing.findMany({
    where: {
      employeeId: { in: employeeIds },
      recordedAt: { gte: manilaDate },
    },
    orderBy: [{ employeeId: 'asc' }, { recordedAt: 'desc' }],
    distinct: ['employeeId'],
    select: {
      employeeId: true,
      lat: true,
      lng: true,
      accuracy: true,
      recordedAt: true,
    },
  })

  const pingByEmployee = new Map(latestPings.map(p => [p.employeeId, p]))

  // Merge with DTR data
  const locations = activeDTR.map(dtr => {
    const ping = pingByEmployee.get(dtr.employeeId)
    let geofenceOut: boolean | null = null
    if (
      company?.geofenceEnabled &&
      company.geofenceLat != null &&
      company.geofenceLng != null &&
      company.geofenceRadiusMeters != null &&
      ping
    ) {
      const dist = distanceMeters(ping.lat, ping.lng, company.geofenceLat, company.geofenceLng)
      geofenceOut = dist > company.geofenceRadiusMeters
    }
    return {
      employeeId: dtr.employeeId,
      employee: dtr.employee,
      clockInTime: dtr.timeIn,
      clockOutTime: dtr.timeOut,
      clockInLat: dtr.clockInLat,
      clockInLng: dtr.clockInLng,
      clockInAddress: dtr.clockInAddress,
      clockInPhoto: dtr.clockInPhoto ?? null,
      isClockedIn: !dtr.timeOut,
      geofenceOut,
      lastPing: ping
        ? { lat: ping.lat, lng: ping.lng, accuracy: ping.accuracy, recordedAt: ping.recordedAt }
        : null,
    }
  })

  return NextResponse.json({ locations })
}
