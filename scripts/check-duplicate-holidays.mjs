import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Find any date in any company that has more than one holiday row
const rows = await p.$queryRaw`
  SELECT "companyId", "date", COUNT(*)::int AS cnt, ARRAY_AGG("name") AS names
  FROM holidays
  GROUP BY "companyId", "date"
  HAVING COUNT(*) > 1
  ORDER BY "date" DESC
`
console.log(`${rows.length} (companyId × date) groups have duplicate holiday rows\n`)
for (const r of rows) {
  const co = await p.company.findUnique({ where: { id: r.companyId }, select: { name: true } })
  console.log(`  ${co?.name ?? r.companyId}  ${new Date(r.date).toISOString().slice(0,10)}  ×${r.cnt}  [${r.names.join(', ')}]`)
}
await p.$disconnect()
