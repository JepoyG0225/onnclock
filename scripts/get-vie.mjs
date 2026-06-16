import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const entries = await p.payrollRunIncomeEntry.findMany({
  where: { payrollRunId: 'cmp3gwlkg0003132u5v9w5k0d' },
  select: { employeeId: true, incomeTypeId: true, amount: true },
})
console.log(JSON.stringify(entries.map(e => ({ employeeId: e.employeeId, incomeTypeId: e.incomeTypeId, amount: Number(e.amount) }))))
await p.$disconnect()
