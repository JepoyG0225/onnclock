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
      employee: { companyId },
    },
    select: { id: true },
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

  return NextResponse.json({ captures })
}

