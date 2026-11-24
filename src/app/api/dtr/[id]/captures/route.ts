import { activityScope } from '@/lib/attendance/activities'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '24')))

  const record = await prisma.dTRRecord.findFirst({
    where: {
      id,
      employee: await activityScope({ ...ctx, companyId }),
    },
    select: { id: true, clockInPhoto: true, breakInPhoto: true, breakOutPhoto: true, clockOutPhoto: true, timeIn: true, breakIn: true, breakOut: true, timeOut: true },
  })

  if (!record) {
    return NextResponse.json({ error: 'DTR record not found' }, { status: 404 })
  }

  const captures = await prisma.attendanceScreenshot.findMany({
    where: {
      companyId,
      dtrRecordId: id,
    },
    orderBy: { capturedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      imageDataUrl: true,
      capturedAt: true,
    },
  })

  const selfies = [
    { id: `${id}:clock-in`, label: 'Clock-in selfie', imageDataUrl: record.clockInPhoto, capturedAt: record.timeIn },
    { id: `${id}:break-start`, label: 'Break start selfie', imageDataUrl: record.breakInPhoto, capturedAt: record.breakIn },
    { id: `${id}:break-end`, label: 'Break end selfie', imageDataUrl: record.breakOutPhoto, capturedAt: record.breakOut },
    { id: `${id}:clock-out`, label: 'Clock-out selfie', imageDataUrl: record.clockOutPhoto, capturedAt: record.timeOut },
  ].filter(photo => photo.imageDataUrl && photo.capturedAt)
  return NextResponse.json({ captures: [...selfies, ...captures.map(photo => ({ ...photo, label: 'Screenshot' }))] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

