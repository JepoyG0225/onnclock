import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const EXTEND_DAYS = 3

const company = await prisma.company.findFirst({
  where: { name: { contains: 'nextstep', mode: 'insensitive' } },
  select: { id: true, name: true, subscription: { select: { id: true, status: true, plan: true, trialEndsAt: true } } },
})

if (!company) { console.error('NextStep VA not found'); process.exit(1) }
console.log('Before:', JSON.stringify(company, null, 2))

const sub = company.subscription
if (!sub) { console.error('No subscription row'); process.exit(1) }

// Anchor: extend from the later of (current trialEndsAt) or (now). If the
// trial already expired we add the days from today, not retroactively.
const anchor = sub.trialEndsAt && sub.trialEndsAt.getTime() > Date.now()
  ? sub.trialEndsAt
  : new Date()
const newTrialEndsAt = new Date(anchor)
newTrialEndsAt.setDate(newTrialEndsAt.getDate() + EXTEND_DAYS)

const updated = await prisma.subscription.update({
  where: { companyId: company.id },
  data: {
    trialEndsAt: newTrialEndsAt,
    status: 'TRIAL',
    plan: 'TRIAL',
    cancelledAt: null,
    updatedAt: new Date(),
  },
  select: { id: true, status: true, plan: true, trialEndsAt: true },
})

console.log('\nAfter:', JSON.stringify(updated, null, 2))
console.log(`\n+${EXTEND_DAYS} days applied — trial now ends ${updated.trialEndsAt?.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT`)

await prisma.$disconnect()
