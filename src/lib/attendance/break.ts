import { NextRequest, NextResponse } from 'next/server'
import type { AuthContext } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { resolvePunchEmployeeId } from '@/lib/attendance/punch-target'
import { resolveKioskShift } from '@/lib/attendance/kiosk-action'
import { resolveAttendanceLocation, savedGeofence } from '@/lib/attendance/schedule-location'
import { normalizeActivityPhoto } from '@/lib/attendance/activities'
import { locationError } from '@/lib/attendance/location-policy'

export async function performBreak(req: NextRequest, ctx: AuthContext, action: 'BREAK_START' | 'BREAK_END', verifiedEmployeeId?: string, expectedRecordId?: string) {
  const target = await resolvePunchEmployeeId(ctx, undefined, verifiedEmployeeId)
  if (!target.employeeId || target.forbidden) return NextResponse.json({ error: target.forbidden ?? 'Employee not found' }, { status: 403 })
  const existing = await prisma.dTRRecord.findFirst({ where: { employeeId: target.employeeId, timeIn: { not: null }, timeOut: null }, orderBy: { timeIn: 'desc' } })
  if (!existing || (expectedRecordId && existing.id !== expectedRecordId)) return NextResponse.json({ error: 'No active clock-in record found' }, { status: 409 })
  if (action === 'BREAK_START' ? !!existing.breakIn : !existing.breakIn || !!existing.breakOut) return NextResponse.json({ error: action === 'BREAK_START' ? 'Break already recorded' : 'No active break' }, { status: 409 })
  const schedule = await resolveKioskShift(ctx.companyId, target.employeeId, existing)
  if (action === 'BREAK_START' && schedule.breakMinutes <= 0) return NextResponse.json({ error: 'Break is disabled for your schedule.' }, { status: 409 })
  const body = await req.json().catch(() => ({}))
  const employee = verifiedEmployeeId ? null : await prisma.employee.findFirst({ where: { id: target.employeeId, companyId: ctx.companyId, isActive: true }, select: { selfieExempt: true, workSchedule: { select: { requireSelfieOnClockIn: true } }, company: { select: { selfieRequired: true } } } })
  if (!verifiedEmployeeId && !employee) return NextResponse.json({ error: 'Active employee not found' }, { status: 403 })
  const selfieRequired = !verifiedEmployeeId && !employee?.selfieExempt && (employee?.company.selfieRequired || employee?.workSchedule?.requireSelfieOnClockIn)
  if (selfieRequired && !body.photo) return NextResponse.json({ error: 'Capture a fresh selfie before starting or ending your break.' }, { status: 400 })
  let photo: string | null = null
  if (body.photo) {
    try { photo = await normalizeActivityPhoto(body.photo) }
    catch { return NextResponse.json({ error: 'Invalid selfie. Please capture a new photo.' }, { status: 400 }) }
  }
  if (verifiedEmployeeId) {
    const attendance = await resolveAttendanceLocation(ctx.companyId, target.employeeId, existing.timeIn!, existing.date)
    const error = locationError(savedGeofence(existing.attendanceLocation) ?? attendance.policy, body.lat, body.lng)
    if (error) return NextResponse.json({ error }, { status: 403 })
  }
  const now = new Date()
  const updated = await prisma.dTRRecord.updateMany({ where: { id: existing.id, timeOut: null, breakIn: existing.breakIn, breakOut: existing.breakOut }, data: action === 'BREAK_START' ? { breakIn: now, breakInPhoto: photo } : { breakOut: now, breakOutPhoto: photo } })
  if (!updated.count) return NextResponse.json({ error: 'Attendance changed. Check your timesheet before scanning again.' }, { status: 409 })
  const actualBreakMinutes = action === 'BREAK_END' ? Math.max(0, Math.floor((now.getTime() - existing.breakIn!.getTime()) / 60000)) : 0
  const { clockInPhoto: _clockPhoto, breakInPhoto: _startPhoto, breakOutPhoto: _endPhoto, clockOutPhoto: _clockOutPhoto, ...safeRecord } = existing
  return NextResponse.json({ record: { ...safeRecord, ...(action === 'BREAK_START' ? { breakIn: now } : { breakOut: now }) }, message: action === 'BREAK_START' ? 'Break started' : 'Break ended', allowedBreakMinutes: schedule.breakMinutes, actualBreakMinutes, overBreakMinutes: Math.max(0, actualBreakMinutes - schedule.breakMinutes) })
}

