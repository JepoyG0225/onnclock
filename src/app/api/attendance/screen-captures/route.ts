import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const SCREEN_CAPTURE_MIN_PLAN = 70

const payloadSchema = z.object({
  dtrRecordId: z.string().optional(),
  imageDataUrl: z.string().startsWith('data:image/').max(2_000_000),
})

function isMobileUserAgent(ua: string): boolean {
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const [employee, company, subscription] = await Promise.all([
    prisma.employee.findFirst({
      where: { userId: ctx.userId, companyId: ctx.companyId, isActive: true },
      select: { id: true },
    }),
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { screenCaptureEnabled: true },
    }),
    prisma.subscription.findUnique({
      where: { companyId: ctx.companyId },
      select: { pricePerSeat: true },
    }),
  ])

  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const entitled = Number(subscription?.pricePerSeat ?? 0) >= SCREEN_CAPTURE_MIN_PLAN
  const enabled = entitled && (company?.screenCaptureEnabled ?? false)
  if (!enabled) {
    return NextResponse.json({ error: 'Screen capture security is not enabled for this company' }, { status: 403 })
  }

  const ua = req.headers.get('user-agent') ?? ''
  if (isMobileUserAgent(ua)) {
    return NextResponse.json({ error: 'Screen capture requires a laptop or desktop device' }, { status: 403 })
  }

  const now = new Date()
  const manilaOffsetMs = 8 * 60 * 60 * 1000
  const manila = new Date(now.getTime() + manilaOffsetMs)
  const yyyy = manila.getUTCFullYear()
  const mm = String(manila.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(manila.getUTCDate()).padStart(2, '0')
  const manilaDate = new Date(`${yyyy}-${mm}-${dd}`)

  const activeDtr = parsed.data.dtrRecordId
    ? await prisma.dTRRecord.findFirst({
        where: {
          id: parsed.data.dtrRecordId,
          employeeId: employee.id,
          timeIn: { not: null },
          timeOut: null,
        },
        select: { id: true },
      })
    : await prisma.dTRRecord.findFirst({
        where: {
          employeeId: employee.id,
          date: manilaDate,
          timeIn: { not: null },
          timeOut: null,
        },
        select: { id: true },
      })

  if (!activeDtr) {
    return NextResponse.json({ error: 'No active clock-in record found' }, { status: 409 })
  }

  const screenshot = await prisma.attendanceScreenshot.create({
    data: {
      companyId: ctx.companyId,
      employeeId: employee.id,
      dtrRecordId: activeDtr.id,
      imageDataUrl: parsed.data.imageDataUrl,
    },
    select: { id: true, capturedAt: true },
  })

  return NextResponse.json({ screenshot }, { status: 201 })
}
