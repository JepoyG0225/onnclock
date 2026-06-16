import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const company = await prisma.company.findFirst({
  where: { name: { contains: 'korazon', mode: 'insensitive' } },
  select: { id: true, name: true, subscription: { select: { id: true, status: true, plan: true, trialEndsAt: true } } },
})

if (!company) {
  console.error('Korazon not found')
  process.exit(1)
}

console.log('Before:', JSON.stringify(company, null, 2))

// Trial active through end of May 11, 2026 PHT (UTC+8)
const newTrialEndsAt = new Date('2026-05-11T15:59:59.999Z')

const updated = await prisma.subscription.update({
  where: { companyId: company.id },
  data: {
    status: 'TRIAL',
    plan: 'TRIAL',
    trialEndsAt: newTrialEndsAt,
    cancelledAt: null,
    updatedAt: new Date(),
  },
  select: { id: true, plan: true, status: true, trialEndsAt: true, cancelledAt: true },
})

console.log('\nAfter:', JSON.stringify(updated, null, 2))
console.log(`\ntrialEndsAt: ${updated.trialEndsAt?.toISOString()}  (= 2026-05-11 23:59:59 PHT)`)

await prisma.$disconnect()
