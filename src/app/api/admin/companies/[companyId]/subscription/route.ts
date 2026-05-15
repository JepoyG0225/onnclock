import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// `plan` is validated against the Prisma SubscriptionPlan enum (TRIAL |
// MONTHLY | ANNUAL). Short-cycle subscriptions (3M / 6M) come in as
// plan='MONTHLY' with the actual cycle in billingCycle so we don't need
// a Prisma migration. The admin UI sends plan='3_MONTH'/'6_MONTH' for
// convenience — we coerce those down to 'MONTHLY' before writing.
const schema = z.object({
  plan: z.enum(['TRIAL', 'MONTHLY', '3_MONTH', '6_MONTH', 'ANNUAL']),
  status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED']),
  billingCycle: z.enum(['MONTHLY', '3_MONTH', '6_MONTH', 'ANNUAL']).nullable(),
  seatCount: z.number().int().min(0),
  pricePerSeat: z.number().nonnegative(),
})

// Months added to "now" to compute currentPeriodEnd for each cycle. Falls
// back to MONTHLY (+1 month) when null/unrecognized so legacy admin updates
// behave the same as before.
const CYCLE_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  '3_MONTH': 3,
  '6_MONTH': 6,
  ANNUAL: 12,
}

function coercePlan(plan: '3_MONTH' | '6_MONTH' | 'TRIAL' | 'MONTHLY' | 'ANNUAL') {
  if (plan === '3_MONTH' || plan === '6_MONTH') return 'MONTHLY' as const
  return plan
}

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
  // 3M/6M are persisted as plan='MONTHLY' (with the real cycle in
  // billingCycle) so we don't need to extend the Prisma enum.
  const plan = coercePlan(body.plan)
  const isTrial = plan === 'TRIAL'

  const now = new Date()
  const nextPeriodEnd = new Date(now)
  const monthsToAdd = body.billingCycle ? (CYCLE_MONTHS[body.billingCycle] ?? 1) : 1
  nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + monthsToAdd)

  const subscription = await prisma.subscription.upsert({
    where: { companyId },
    update: {
      plan,
      status: body.status,
      billingCycle: body.billingCycle,
      seatCount: body.seatCount,
      pricePerSeat: body.pricePerSeat,
      currentPeriodStart: body.status === 'ACTIVE' ? now : null,
      currentPeriodEnd: body.status === 'ACTIVE' ? nextPeriodEnd : null,
      trialEndsAt: isTrial ? nextPeriodEnd : null,
      cancelledAt: body.status === 'CANCELLED' ? now : null,
      updatedAt: now,
    },
    create: {
      id: `sub_${companyId}`,
      companyId,
      plan,
      status: body.status,
      billingCycle: body.billingCycle,
      seatCount: body.seatCount,
      pricePerSeat: body.pricePerSeat,
      currentPeriodStart: body.status === 'ACTIVE' ? now : null,
      currentPeriodEnd: body.status === 'ACTIVE' ? nextPeriodEnd : null,
      trialEndsAt: isTrial ? nextPeriodEnd : null,
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

