import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const COMPANY_ID = 'cmnrr36ih0002z07gw1hq6kjj'
const cycle = await p.payrollCycleConfig.findUnique({ where: { companyId: COMPANY_ID } })
const ndStart = (() => { const [h,m] = cycle.nightDifferentialStart.split(':').map(Number); return h*60+m })()
const ndEnd   = (() => { const [h,m] = cycle.nightDifferentialEnd.split(':').map(Number); return h*60+m })()
console.log('ND window (PHT):', ndStart, '-', ndEnd, '   includeBreak:', cycle.nightDifferentialIncludesBreak)

const emp = await p.employee.findFirst({ where: { firstName: 'PRIMA', companyId: COMPANY_ID } })
const dtrs = await p.dTRRecord.findMany({
  where: { employeeId: emp.id, date: { gte: new Date('2026-04-26'), lte: new Date('2026-05-10') } },
  orderBy: { date: 'asc' },
})

function phtMin(d) {
  if (!d) return null
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 480) % 1440
}

console.log('\nStored DTR data:')
for (const d of dtrs) {
  console.log(
    d.date.toISOString().slice(0,10),
    '  PHT in/out:', phtMin(d.timeIn), '/', phtMin(d.timeOut),
    '  break PHT:', phtMin(d.breakIn), '/', phtMin(d.breakOut),
    '  reg:', d.regularHours?.toString(),
    '  OT:', d.overtimeHours?.toString(),
    '  ND:', d.nightDiffHours?.toString(),
    '  late:', d.lateMinutes,
  )
}

await p.$disconnect()
