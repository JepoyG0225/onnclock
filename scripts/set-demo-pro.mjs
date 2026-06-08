import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const company = await prisma.company.findFirst({
  where: { name: { equals: 'Demo Inc', mode: 'insensitive' } },
  select: { id: true, name: true, subscription: true },
})

if (!company) {
  console.error('Demo Inc not found')
  process.exit(1)
}

const updated = await prisma.subscription.update({
  where: { companyId: company.id },
  data: {
    plan: 'ANNUAL',
    status: 'ACTIVE',
    pricePerSeat: 100,
    billingCycle: 'ANNUAL',
  },
  select: { plan: true, status: true, pricePerSeat: true, billingCycle: true, currentPeriodEnd: true },
})

console.log(`Updated ${company.name} (${company.id}):`)
console.log(JSON.stringify(updated, null, 2))

await prisma.$disconnect()
