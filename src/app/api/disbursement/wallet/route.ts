import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createQrPhPayment } from '@/lib/payments/paymongo'
import { z } from 'zod'
import { nanoid } from 'nanoid'

/** GET — wallet balance + recent top-ups */
export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { disbursementBalance: true },
  })
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const topUps = await prisma.disbursementTopUp.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true, amountPeso: true, status: true,
      confirmedAt: true, createdAt: true,
    },
  })

  return NextResponse.json({
    balance: company.disbursementBalance.toNumber(),
    topUps: topUps.map(t => ({
      id:          t.id,
      amountPeso:  t.amountPeso.toNumber(),
      status:      t.status,
      confirmedAt: t.confirmedAt,
      createdAt:   t.createdAt,
    })),
  })
}

const topUpSchema = z.object({
  amountPeso: z.number().min(100).max(5_000_000),
})

/** POST — initiate a QR Ph top-up */
export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body   = await req.json().catch(() => ({}))
  const parsed = topUpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { name: true, email: true },
  })
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const topUpId   = nanoid()
  const expiresAt = new Date(Date.now() + 29 * 60 * 1000)

  let qrResult
  try {
    qrResult = await createQrPhPayment({
      amountPeso:   parsed.data.amountPeso,
      description:  `Payroll Disbursement Top-Up — ${company.name}`,
      billingName:  company.name,
      billingEmail: company.email ?? 'billing@onclockph.com',
      metadata: {
        type:      'DISBURSEMENT_TOPUP',
        topUpId,
        companyId: ctx.companyId,
      },
    })
  } catch (e) {
    console.error('PayMongo top-up error:', e)
    return NextResponse.json({ error: 'Failed to generate QR code. Please try again.' }, { status: 502 })
  }

  await prisma.disbursementTopUp.create({
    data: {
      id:             topUpId,
      companyId:      ctx.companyId,
      amountPeso:     parsed.data.amountPeso,
      status:         'PENDING',
      paymentIntentId: qrResult.paymentIntentId,
      qrImage:        qrResult.qrImage,
      expiresAt,
    },
  })

  return NextResponse.json({
    topUpId,
    paymentIntentId: qrResult.paymentIntentId,
    qrImage:         qrResult.qrImage,
    amountPeso:      parsed.data.amountPeso,
    expiresAt:       expiresAt.toISOString(),
  }, { status: 201 })
}
