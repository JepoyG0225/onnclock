import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { ensureDefaultPaymentMethods } from '@/lib/billing/payment-methods'

const createSchema = z.object({
  code: z.string().min(2).max(50).regex(/^[A-Z0-9_]+$/),
  label: z.string().min(2).max(120),
  type: z.enum(['GCASH', 'BANK_TRANSFER', 'E_WALLET', 'OTHER']),
  bankName: z.string().max(120).optional().nullable(),
  accountName: z.string().max(120).optional().nullable(),
  accountNumber: z.string().max(120).optional().nullable(),
  instructions: z.string().max(500).optional().nullable(),
  qrImageUrl: z.string().url().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).default(100),
  isActive: z.boolean().default(true),
})

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  await ensureDefaultPaymentMethods()
  const methods = await prisma.paymentMethod.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ methods })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const body = createSchema.parse(await req.json())
  const method = await prisma.paymentMethod.create({
    data: {
      ...body,
      code: body.code.toUpperCase(),
    },
  })

  return NextResponse.json({ method }, { status: 201 })
}

