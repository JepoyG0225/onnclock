import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { activityScope, decodeActivityPhoto } from '@/lib/attendance/activities'
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error
  try {
    const { id } = await params
    const scope = await activityScope(ctx)
    const row = await prisma.attendanceActivity.findFirst({ where: { id, dtrRecord: { employee: scope } }, select: { photo: true, photos: true } })
    const index = Number(req.nextUrl.searchParams.get('index') ?? 0)
    const photo = Number.isInteger(index) && index >= 0 ? (row?.photos?.length ? row.photos[index] : index === 0 ? row?.photo : null) : null
    if (!photo) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })
    const { bytes, mime } = decodeActivityPhoto(photo)
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } })
  } catch { return NextResponse.json({ error: 'Photo unavailable.' }, { status: 403 }) }
}
