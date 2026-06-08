import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const c = await prisma.company.findFirst({ where: { name: { contains: 'corex', mode: 'insensitive' } }, select: { id: true, name: true } })
const cfg = await prisma.payrollCycleConfig.findUnique({
  where: { companyId: c.id },
  select: { nightDifferentialStart: true, nightDifferentialEnd: true, nightDifferentialIncludesBreak: true }
}).catch(() => null)
console.log(c.name, JSON.stringify(cfg, null, 2))
await prisma.$disconnect()
