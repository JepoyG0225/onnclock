import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const company = await prisma.company.findFirst({
  where: { name: { contains: 'corex', mode: 'insensitive' } },
  select: { id: true, name: true },
})
console.log(`${company.name} (${company.id})\n`)

const runs = await prisma.payrollRun.findMany({
  where: { companyId: company.id },
  select: {
    id: true,
    periodStart: true,
    periodEnd: true,
    payFrequency: true,
    status: true,
    createdAt: true,
    _count: { select: { payslips: true } },
  },
  orderBy: { periodStart: 'desc' },
})

console.log(`Payroll runs: ${runs.length}\n`)
for (const r of runs) {
  console.log(`  ${r.id}`)
  console.log(`    ${r.periodStart.toISOString().slice(0,10)} → ${r.periodEnd.toISOString().slice(0,10)}  ${r.payFrequency}  ${r.status}  ${r._count.payslips} payslips`)
}

await prisma.$disconnect()
