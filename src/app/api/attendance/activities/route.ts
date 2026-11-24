import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { activityScope, activitySelect, normalizeActivityPhoto, listActivities, monthRange, numberActivities } from '@/lib/attendance/activities'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error
  try {
    const scope = await activityScope(ctx)
    const dtrId = req.nextUrl.searchParams.get('dtrRecordId')
    const month = req.nextUrl.searchParams.get('month') ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(new Date())
    const employee = await prisma.employee.findFirst({ where: { companyId: ctx.companyId, userId: ctx.userId, isActive: true }, select: { id: true } })
    const active = employee ? await prisma.dTRRecord.findFirst({ where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null }, orderBy: { timeIn: 'desc' }, select: { id: true, date: true } }) : null
    const where: Prisma.AttendanceActivityWhereInput = { dtrRecord: { employee: scope, ...(dtrId ? { id: dtrId } : { employeeId: employee?.id ?? '__none__', date: monthRange(month) }) } }
    const count = await prisma.attendanceActivity.count({ where })
    const summaryShift = dtrId ? null : active ?? (employee ? await prisma.dTRRecord.findFirst({
      where: { employeeId: employee.id, timeIn: { not: null } },
      orderBy: [{ timeIn: 'desc' }, { id: 'desc' }], select: { id: true, date: true },
    }) : null)
    const shiftTotal = dtrId ? count : summaryShift ? await prisma.attendanceActivity.count({
      where: { dtrRecord: { id: summaryShift.id, employee: scope } },
    }) : null
    const page = Math.max(1, Math.min(10000, Number(req.nextUrl.searchParams.get('page')) || 1))
    const ids = await prisma.attendanceActivity.findMany({ where, orderBy: [{ loggedAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50, select: { id: true, loggedAt: true, dtrRecord: { select: { employeeId: true } } } })
    const activities = await listActivities({ AND: [where, { id: { in: ids.map(i => i.id) } }] })
    const numbered = await numberActivities(activities, scope)
    return NextResponse.json({ activities: numbered, count, page, shiftTotal, shiftLabel: dtrId ? 'This shift' : active ? 'Current shift' : 'Latest shift', activeDtr: active, photoUploadEnabled: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to load activities.' }, { status: 400 }) }
}
const schema = z.object({ id: z.string().uuid(), dtrRecordId: z.string().min(1), description: z.string().trim().min(1).max(2000), notes: z.string().trim().max(2000).optional(), photo: z.string().max(2_000_000).optional(), photos: z.array(z.string().max(2_000_000)).min(1).max(5).optional(), photoSource: z.enum(['camera', 'upload']).optional(), location: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), locationAccuracy: z.number().finite().min(0), locationCapturedAt: z.string().datetime() }).optional() })
export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error
  try {
    if (Number(req.headers.get('content-length') ?? 0) > 4_000_000) throw new Error('Photo is too large.')
    const body = schema.parse(await req.json())
    const rawPhotos = body.photos ?? (body.photo ? [body.photo] : [])
    if (rawPhotos.reduce((sum, image) => sum + image.length, 0) > 3_500_000) throw new Error('Combined photos are too large. Retake them at a lower resolution.')
    if (!rawPhotos.length) return NextResponse.json({ error: 'Take a photo before logging this activity.' }, { status: 400 })
    if (rawPhotos.length && body.photoSource !== 'camera') {
      return NextResponse.json({ error: 'Photo uploads are no longer available. Take a photo using the live camera instead.' }, { status: 403 })
    }
    const photos = await Promise.all(rawPhotos.map(normalizeActivityPhoto))
    const photo = photos[0]
    const employee = await prisma.employee.findFirst({ where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true }, select: { id: true } })
    if (!employee) return NextResponse.json({ error: 'An active employee profile is required.' }, { status: 403 })
    const activity = await prisma.$transaction(async tx => {
      // Lock the shift so a simultaneous clock-out cannot slip between validation and save.
      const records = await tx.$queryRaw<Array<{ id: string; timeIn: Date | null; timeOut: Date | null }>>`SELECT "id", "timeIn", "timeOut" FROM "dtr_records" WHERE "id" = ${body.dtrRecordId} AND "employeeId" = ${employee.id} FOR UPDATE`
      if (!records.length) throw new Error('Attendance record not found.')
      const existing = await tx.attendanceActivity.findUnique({ where: { id: body.id }, select: { ...activitySelect, photo: true, photos: true } })
      if (existing) {
        if (existing.dtrRecordId !== body.dtrRecordId || existing.description !== body.description || existing.photo !== photo || (existing.photos?.length && JSON.stringify(existing.photos) !== JSON.stringify(photos)) || existing.notes !== (body.notes || null)) throw new Error('This request reference was already used.')
        return { id: existing.id, dtrRecordId: existing.dtrRecordId, description: existing.description, loggedAt: existing.loggedAt }
      }
      if (!records[0].timeIn || records[0].timeOut) throw new Error('Clock in before logging an activity. This shift is not active.')
      return tx.attendanceActivity.create({ data: { id: body.id, dtrRecordId: body.dtrRecordId, description: body.description, notes: body.notes || null, photo, photos, photoCount: photos.length, ...(body.location ? { ...body.location, locationCapturedAt: new Date(body.location.locationCapturedAt) } : {}) }, select: activitySelect })
    })
    return NextResponse.json({ activity }, { status: 201 })
  } catch (e) { return NextResponse.json({ error: e instanceof z.ZodError ? 'Enter an activity and a valid photo.' : e instanceof Error ? e.message : 'Could not save activity.' }, { status: 400 }) }
}
