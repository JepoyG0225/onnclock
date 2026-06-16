import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const run = await p.payrollRun.findUnique({
  where: { id: 'cmp2wkl660001gf6vjfkub672' },
  select: { id: true, companyId: true, status: true, periodStart: true, periodEnd: true },
})
console.log('Run:', JSON.stringify(run, null, 2))
await p.$disconnect()
