import { NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  let sub = await prisma.subscription.findUnique({
    where: { companyId: ctx.companyId },
  })

  // Auto-create trial if missing (existing companies)
  if (!sub) {
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 7)
    sub = await prisma.subscription.create({
      data: {
        id: `sub_${ctx.companyId}`,
        companyId: ctx.companyId,
        plan: 'TRIAL',
        status: 'TRIAL',
        trialEndsAt,
        pricePerSeat: 50,
        seatCount: 0,
        updatedAt: new Date(),
      },
    })
  }

  // Sync seat count with current active employees
  const employeeCount = await prisma.employee.count({
    where: { companyId: ctx.companyId, isActive: true },
  })

  // Check if trial has expired and auto-update status
  if (sub.status === 'TRIAL' && sub.trialEndsAt && sub.trialEndsAt < new Date()) {
    sub = await prisma.subscription.update({
      where: { companyId: ctx.companyId },
      data: { status: 'EXPIRED', seatCount: employeeCount, updatedAt: new Date() },
    })
  } else if (sub.status === 'TRIAL') {
    // Keep seat count in sync
    sub = await prisma.subscription.update({
      where: { companyId: ctx.companyId },
      data: { seatCount: employeeCount, updatedAt: new Date() },
    })
  }

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { name: true, email: true, address: true, city: true },
  })

  // Compute estimated next bill
  const pricePerSeat = Number(sub.pricePerSeat)
  const isAnnual = sub.billingCycle === 'ANNUAL'
  const discountPct = isAnnual ? 20 : 0
  const effectiveMonthlyRate = isAnnual ? pricePerSeat * 0.8 : pricePerSeat
  const estimatedMonthly = effectiveMonthlyRate * employeeCount
  const estimatedAnnual = pricePerSeat * 12 * 0.8 * employeeCount

  const daysLeft =
    sub.status === 'TRIAL' && sub.trialEndsAt
      ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000))
      : null

  return NextResponse.json({
    subscription: {
      ...sub,
      pricePerSeat: Number(sub.pricePerSeat),
    },
    employeeCount,
    daysLeft,
    discountPct,
    effectiveMonthlyRate,
    estimatedMonthly,
    estimatedAnnual,
    company,
  })
  } catch (err) {
    console.error('[GET /api/billing/subscription]', err)
    return NextResponse.json({ error: 'Failed to load subscription' }, { status: 500 })
  }
}
