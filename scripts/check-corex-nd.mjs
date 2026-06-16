import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const company = await prisma.company.findFirst({
  where: { name: { contains: 'corex', mode: 'insensitive' } },
  select: { id: true, name: true },
})
if (!company) { console.error('Corex not found'); process.exit(1) }

const cfg = await prisma.payrollCycleConfig.findUnique({
  where: { companyId: company.id },
  select: {
    nightDifferentialStart: true,
    nightDifferentialEnd: true,
    nightDifferentialRate: true,
    enableNightDifferential: true,
  },
})
console.log(`Company: ${company.name}  (${company.id})`)
console.log(`Payroll config:`, JSON.stringify(cfg, null, 2))

await prisma.$disconnect()
