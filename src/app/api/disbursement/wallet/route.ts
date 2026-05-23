import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createQrPhPayment } from '@/lib/payments/paymongo'
import { z } from 'zod'
import { nanoid } from 'nanoid'

/** GET — return company disbursement wallet balance + recent top-ups */
export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: {
      disbursementBalance: true,
      disbursementSourceAccountNo: true,
      disbursementSourceAccountName: true,
      disbursementSourceBic: true,
    },
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
    sourceAccount: {
      accountNo: company.disbursementSourceAccountNo,
      accountName: company.disbursementSourceAccountName,
      bic: company.disbursementSourceBic,
    },
    topUps: topUps.map(t => ({
      id: t.id,
      amountPeso: t.amountPeso.toNumber(),
      status: t.status,
      confirmedAt: t.confirmedAt,
      createdAt: t.createdAt,
    })),
  })
}

const topUpSchema = z.object({
  amountPeso: z.number().min(100).max(5_000_000),
})

const sourceSchema = z.object({
  sourceAccountNo:   z.string().min(1),
  sourceAccountName: z.string().min(1),
  sourceBic:         z.string().min(8).max(11),
})

/** POST — initiate a QR Ph top-up OR save source account config */
export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => ({}))

  // Save source account config (no payment created)
  if ('sourceAccountNo' in body) {
    const parsed = sourceSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
    }
    await prisma.company.update({
      where: { id: ctx.companyId },
      data: {
        disbursementSourceAccountNo:   parsed.data.sourceAccountNo,
        disbursementSourceAccountName: parsed.data.sourceAccountName,
        disbursementSourceBic:         parsed.data.sourceBic,
      },
    })
    return NextResponse.json({ success: true })
  }

  // Initiate QR Ph top-up
  const parsed = topUpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { name: true, email: true },
  })
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const topUpId = nanoid()
  const expiresAt = new Date(Date.now() + 29 * 60 * 1000)

  // Create PayMongo QR
  let qrResult
  try {
    qrResult = await createQrPhPayment({
      amountPeso: parsed.data.amountPeso,
      description: `Payroll Disbursement Top-Up — ${company.name}`,
      billingName: company.name,
      billingEmail: company.email ?? 'billing@onclockph.com',
      metadata: {
        type: 'DISBURSEMENT_TOPUP',
        topUpId,
        companyId: ctx.companyId,
      },
    })
  } catch (e) {
    console.error('PayMongo top-up error:', e)
    return NextResponse.json({ error: 'Failed to generate QR code. Please try again.' }, { status: 502 })
  }

  // Persist the top-up record
  await prisma.disbursementTopUp.create({
    data: {
      id: topUpId,
      companyId: ctx.companyId,
      amountPeso: parsed.data.amountPeso,
      status: 'PENDING',
      paymentIntentId: qrResult.paymentIntentId,
      qrImage: qrResult.qrImage,
      expiresAt,
    },
  })

  return NextResponse.json({
    topUpId,
    paymentIntentId: qrResult.paymentIntentId,
    qrImage: qrResult.qrImage,
    amountPeso: parsed.data.amountPeso,
    expiresAt: expiresAt.toISOString(),
  }, { status: 201 })
}
