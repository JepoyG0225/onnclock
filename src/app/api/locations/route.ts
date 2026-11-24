import { savedGeofence } from '@/lib/attendance/schedule-location'
import { effectiveGeofence, geofenceStatus } from '@/lib/attendance/location-policy'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getManilaDateOnly } from '@/lib/date-manila'

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
          geofenceExempt: true,
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
    const policy = savedGeofence(dtr.attendanceLocation) ?? (company ? effectiveGeofence(null, dtr.employee.geofenceExempt, company) : null)
    const geofenceOut = policy?.enabled && ping ? !(geofenceStatus(policy, ping.lat, ping.lng)?.inside ?? false) : null
    return {
      employeeId: dtr.employeeId,
      employee: dtr.employee,
      dtrId: dtr.id,
      clockInTime: dtr.timeIn,
      clockOutTime: dtr.timeOut,
      breakIn: dtr.breakIn,
      breakOut: dtr.breakOut,
      isOnBreak: !!dtr.breakIn && !dtr.breakOut,
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
