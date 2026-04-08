import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  plan: z.enum(['TRIAL', 'MONTHLY', 'ANNUAL']),
  status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED']),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).nullable(),
  seatCount: z.number().int().min(0),
  pricePerSeat: z.number().nonnegative(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const { companyId } = await params
  const body = schema.parse(await req.json())

  const now = new Date()
  const nextPeriodEnd = new Date(now)
  if (body.billingCycle === 'ANNUAL') {
    nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1)
  } else {
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1)
  }

  const subscription = await prisma.subscription.upsert({
    where: { companyId },
    update: {
      plan: body.plan,
      status: body.status,
      billingCycle: body.billingCycle,
      seatCount: body.seatCount,
      pricePerSeat: body.pricePerSeat,
      currentPeriodStart: body.status === 'ACTIVE' ? now : null,
      currentPeriodEnd: body.status === 'ACTIVE' ? nextPeriodEnd : null,
      trialEndsAt: body.plan === 'TRIAL' ? nextPeriodEnd : null,
      cancelledAt: body.status === 'CANCELLED' ? now : null,
      updatedAt: now,
    },
    create: {
      id: `sub_${companyId}`,
      companyId,
      plan: body.plan,
      status: body.status,
      billingCycle: body.billingCycle,
      seatCount: body.seatCount,
      pricePerSeat: body.pricePerSeat,
      currentPeriodStart: body.status === 'ACTIVE' ? now : null,
      currentPeriodEnd: body.status === 'ACTIVE' ? nextPeriodEnd : null,
      trialEndsAt: body.plan === 'TRIAL' ? nextPeriodEnd : null,
      cancelledAt: body.status === 'CANCELLED' ? now : null,
      updatedAt: now,
    },
  })

  return NextResponse.json({
    subscription: {
      ...subscription,
      pricePerSeat: Number(subscription.pricePerSeat),
    },
  })
}

