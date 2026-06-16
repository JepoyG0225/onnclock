import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasScreenCaptureFeature } from '@/lib/feature-gates'
import { z } from 'zod'

const payloadSchema = z.object({
  dtrRecordId: z.string().optional(),
  imageDataUrl: z.string().startsWith('data:image/').max(2_000_000),
})

function isMobileUserAgent(ua: string): boolean {
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const [employee, company, sub] = await Promise.all([
    prisma.employee.findFirst({
      where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true },
      select: { id: true },
    }),
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { screenCaptureEnabled: true },
    }),
    getCompanySubscription(ctx.companyId),
  ])

  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const entitled = hasScreenCaptureFeature(sub.pricePerSeat, sub.isTrial)
  const enabled  = entitled && (company?.screenCaptureEnabled ?? false)
  if (!enabled) {
    return NextResponse.json({ error: 'Screen capture is not enabled for this company' }, { status: 403 })
  }

  const ua = req.headers.get('user-agent') ?? ''
  if (isMobileUserAgent(ua)) {
    return NextResponse.json({ error: 'Screen capture requires a laptop or desktop device' }, { status: 403 })
  }

  const activeDtr = parsed.data.dtrRecordId
    ? await prisma.dTRRecord.findFirst({
        where: { id: parsed.data.dtrRecordId, employeeId: employee.id, timeIn: { not: null }, timeOut: null },
        select: { id: true },
      })
    : await prisma.dTRRecord.findFirst({
        where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null },
        orderBy: { timeIn: 'desc' },
        select: { id: true },
      })

  if (!activeDtr) {
    return NextResponse.json({ error: 'No active clock-in record found' }, { status: 409 })
  }

  const screenshot = await prisma.attendanceScreenshot.create({
    data: {
      companyId:    ctx.companyId,
      employeeId:   employee.id,
      dtrRecordId:  activeDtr.id,
      imageDataUrl: parsed.data.imageDataUrl,
    },
    select: { id: true, capturedAt: true },
  })

  return NextResponse.json({ screenshot }, { status: 201 })
}
