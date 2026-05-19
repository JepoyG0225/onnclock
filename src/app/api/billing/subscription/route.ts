import { NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getPausedEmployees } from '@/lib/billing/seat-limit'

export async function GET() {
  try {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  // SUPER_ADMIN without an active impersonation session has no
  // companyId — they shouldn't be hitting this endpoint. Return a
  // clear error code so the billing page can render a friendly
  // "pick a company to view billing" prompt instead of going blank.
  if (!ctx.companyId) {
    return NextResponse.json(
      {
        error: 'No company context. Impersonate a company to view their billing.',
        code: 'NO_COMPANY_CONTEXT',
      },
      { status: 400 },
    )
  }

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

  // Paused employees — those over the paid seat cap whose portal access
  // is auto-locked until the company adds seats. Returned with the
  // subscription payload so the billing page can list them inline next
  // to the "X unbilled employees" banner.
  const paused = await getPausedEmployees(ctx.companyId)

  return NextResponse.json({
    subscription: {
      ...sub,
      pricePerSeat: Number(sub.pricePerSeat),
      creditBalance: Number(
        (sub as unknown as { creditBalance?: { toNumber(): number } | number }).creditBalance ?? 0,
      ),
    },
    employeeCount,
    daysLeft,
    discountPct,
    effectiveMonthlyRate,
    estimatedMonthly,
    estimatedAnnual,
    company,
    pausedEmployees: paused.details.map(e => ({
      id: e.id,
      employeeNo: e.employeeNo,
      fullName: `${e.lastName}, ${e.firstName}`,
    })),
  })
  } catch (err) {
    console.error('[GET /api/billing/subscription]', err)
    return NextResponse.json({ error: 'Failed to load subscription' }, { status: 500 })
  }
}
