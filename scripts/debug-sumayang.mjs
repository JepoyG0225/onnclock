import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const COMPANY_ID = 'cmnrr36ih0002z07gw1hq6kjj'
const RUN_ID = 'cmp5xou1a0001bla0gocbg6x2'

// Compare SUMAYANG (off by 7h) vs PRIMA (matches exactly)
for (const name of ['SUMAYANG', 'FERRAREN', 'NICOLAS']) {
  const emp = await p.employee.findFirst({ where: { lastName: { equals: name }, companyId: COMPANY_ID } })
  if (!emp) { console.log(`!! ${name} not found`); continue }
  const dtrs = await p.dTRRecord.findMany({
    where: { employeeId: emp.id, date: { gte: new Date('2026-04-26'), lte: new Date('2026-05-10') } },
    orderBy: { date: 'asc' },
  })
  console.log(`\n=== ${emp.firstName} ${emp.lastName} (${dtrs.length} DTRs) ===`)
  for (const d of dtrs) {
    const inUTC  = d.timeIn?.toISOString()
    const outUTC = d.timeOut?.toISOString()
    const dur = d.timeIn && d.timeOut ? ((d.timeOut - d.timeIn) / 60000).toFixed(0) + 'min' : '—'
    console.log(`  ${d.date.toISOString().slice(0,10)}  in=${inUTC?.slice(11,19)}Z  out=${outUTC?.slice(11,19)}Z (${outUTC?.slice(8,10) !== inUTC?.slice(8,10) ? 'next-day' : 'same-day'})  dur=${dur}  ND=${d.nightDiffHours}`)
  }
}

await p.$disconnect()
