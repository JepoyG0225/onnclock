/**
 * Reset COREX night-differential window to the legal default 22:00–06:00 PHT.
 * Idempotent — re-run safe.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const company = await prisma.company.findFirst({
  where: { name: { contains: 'corex', mode: 'insensitive' } },
  select: { id: true, name: true },
})
if (!company) { console.error('Corex not found'); process.exit(1) }

const before = await prisma.payrollCycleConfig.findUnique({
  where: { companyId: company.id },
  select: { nightDifferentialStart: true, nightDifferentialEnd: true, enableNightDifferential: true, nightDifferentialRate: true },
})
console.log(`${company.name}  (${company.id})`)
console.log('Before:', JSON.stringify(before, null, 2))

const after = await prisma.payrollCycleConfig.upsert({
  where: { companyId: company.id },
  create: {
    companyId: company.id,
    nightDifferentialStart: '22:00',
    nightDifferentialEnd: '06:00',
  },
  update: {
    nightDifferentialStart: '22:00',
    nightDifferentialEnd: '06:00',
  },
  select: { nightDifferentialStart: true, nightDifferentialEnd: true },
})
console.log('\nAfter:', JSON.stringify(after, null, 2))
await prisma.$disconnect()
