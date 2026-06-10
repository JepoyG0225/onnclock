import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const subs = await prisma.subscription.findMany({
  where: { status: 'TRIAL' },
  include: { company: { select: { name: true } } },
  orderBy: { trialEndsAt: 'desc' },
  take: 15,
})

const now = new Date()
console.log(`Found ${subs.length} TRIAL subscriptions\n`)
for (const s of subs) {
  const trialExpired = s.trialEndsAt && s.trialEndsAt < now
  const ppe = Number(s.pricePerSeat ?? 0)
  const isTrialDB = s.status === 'TRIAL'
  const computedStatus = isTrialDB && trialExpired ? 'EXPIRED' : s.status
  // Layout's logic
  const hrisProEnabled = isTrialDB || ppe >= 100
  console.log(`${s.company.name}`)
  console.log(`  status=${s.status} (computed=${computedStatus}) | trialEndsAt=${s.trialEndsAt?.toISOString() ?? '-'} | trialExpired=${trialExpired}`)
  console.log(`  pricePerSeat=${ppe} | seatCount=${s.seatCount}`)
  console.log(`  → hrisProEnabled (layout) = ${hrisProEnabled}`)
  console.log()
}
process.exit(0)
