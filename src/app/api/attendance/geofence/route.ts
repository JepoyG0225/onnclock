import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { resolveAttendanceLocation, savedGeofence } from '@/lib/attendance/schedule-location'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const employee = await prisma.employee.findFirst({ where: { userId: ctx.userId, companyId: ctx.companyId }, select: { id: true } })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  const open = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null }, orderBy: { timeIn: 'desc' },
    select: { timeIn: true, date: true, attendanceLocation: true },
  })
  const resolved = await resolveAttendanceLocation(ctx.companyId, employee.id, open?.timeIn ?? new Date(), open?.date)
  const policy = savedGeofence(open?.attendanceLocation) ?? resolved.policy
  const first = policy.locations[0]
  return NextResponse.json({ ...policy, lat: first?.lat ?? null, lng: first?.lng ?? null, radiusMeters: first?.radiusMeters ?? null },
    { headers: { 'Cache-Control': 'no-store' } })
}
