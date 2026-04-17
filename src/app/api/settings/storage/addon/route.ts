import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { STORAGE_ADDON_TIERS } from '@/lib/document-storage'

const VALID_ADDON_GB = [0, ...STORAGE_ADDON_TIERS.map((t) => t.gb)] as const
type ValidAddOnGb = (typeof VALID_ADDON_GB)[number]

const schema = z.object({
  addOnGb: z.union([z.literal(0), z.literal(50), z.literal(100), z.literal(500)]),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN'])
  if (error) return error

  const body = schema.safeParse(await req.json().catch(() => ({})))
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid add-on selection.' }, { status: 400 })
  }

  const { addOnGb } = body.data as { addOnGb: ValidAddOnGb }

  // Find matching tier price (0 = remove add-on)
  const tier = STORAGE_ADDON_TIERS.find((t) => t.gb === addOnGb)
  const addOnPrice = tier?.monthlyPrice ?? 0

  // Upsert subscription with new add-on values
  let subscription
  try {
    subscription = await prisma.subscription.upsert({
      where: { companyId: ctx.companyId },
      update: {
        storageAddOnGb: addOnGb,
        storageAddOnPrice: addOnPrice,
        updatedAt: new Date(),
      },
      create: {
        id: `sub_${ctx.companyId}`,
        companyId: ctx.companyId,
        plan: 'TRIAL',
        status: 'TRIAL',
        pricePerSeat: 50,
        seatCount: 0,
        storageAddOnGb: addOnGb,
        storageAddOnPrice: addOnPrice,
        updatedAt: new Date(),
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Storage add-on columns are not available yet. Please run the pending database migration in Supabase first.' },
      { status: 503 }
    )
  }

  return NextResponse.json({
    addOnGb: subscription.storageAddOnGb,
    addOnPrice: Number(subscription.storageAddOnPrice),
    message: addOnGb === 0
      ? 'Storage add-on removed. Takes effect on your next billing cycle.'
      : `Storage add-on updated to +${addOnGb} GB at ₱${addOnPrice.toLocaleString('en-PH')}/month. Takes effect on your next billing cycle.`,
  })
}
