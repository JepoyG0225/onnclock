import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * One-time endpoint: creates a 7-day free trial subscription for every company
 * that doesn't already have one.
 *
 * Call once:  POST /api/admin/seed-subscriptions
 * Protected by ADMIN_SEED_SECRET header to prevent accidental re-runs.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-admin-secret')
  if (!secret || secret !== (process.env.ADMIN_SEED_SECRET ?? 'onclock-seed-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find all companies that have no subscription row
  const companies = await prisma.company.findMany({
    where: { subscription: null },
    select: { id: true, name: true },
  })

  if (companies.length === 0) {
    return NextResponse.json({ message: 'All companies already have a subscription.', seeded: 0 })
  }

  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 7)

  // Create subscriptions in parallel
  const results = await Promise.allSettled(
    companies.map((company) =>
      prisma.subscription.create({
        data: {
          id: `sub_${company.id}`,
          companyId: company.id,
          plan: 'TRIAL',
          status: 'TRIAL',
          trialEndsAt,
          pricePerSeat: 50,
          seatCount: 0,
          updatedAt: new Date(),
        },
      })
    )
  )

  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  const failed    = results.filter((r) => r.status === 'rejected').map((r, i) => ({
    company: companies[i]?.name,
    reason: r.status === 'rejected' ? String(r.reason) : '',
  }))

  return NextResponse.json({
    message: `Seeded ${succeeded} of ${companies.length} companies.`,
    seeded: succeeded,
    failed,
  })
}
