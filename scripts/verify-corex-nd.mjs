import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const company = await prisma.company.findFirst({
  where: { name: { contains: 'corex', mode: 'insensitive' } },
  select: { id: true, name: true },
})
if (!company) { console.error('Corex not found'); process.exit(1) }

// Sample 5 recent DTRs with breaks and show ND vs break math
const dtrs = await prisma.dTRRecord.findMany({
  where: {
    employee: { companyId: company.id },
    timeIn: { not: null }, timeOut: { not: null },
    breakIn: { not: null }, breakOut: { not: null },
  },
  select: {
    timeIn: true, timeOut: true, breakIn: true, breakOut: true,
    regularHours: true, overtimeHours: true, nightDiffHours: true,
    employee: { select: { firstName: true, lastName: true } },
  },
  orderBy: { date: 'desc' },
  take: 5,
})

function getManilaMinutes(d) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  return Number(parts.find(p => p.type === 'hour')?.value ?? '0') * 60 + Number(parts.find(p => p.type === 'minute')?.value ?? '0')
}
function fmtPht(d) { return d ? d.toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—' }

console.log(`${company.name} — sample DTRs (most recent 5 with breaks)\n`)
for (const d of dtrs) {
  const inMins = getManilaMinutes(d.timeIn)
  const outMins = getManilaMinutes(d.timeOut)
  const brkInMins = d.breakIn ? getManilaMinutes(d.breakIn) : null
  const brkOutMins = d.breakOut ? getManilaMinutes(d.breakOut) : null
  const breakDur = brkInMins != null && brkOutMins != null
    ? (brkOutMins >= brkInMins ? brkOutMins - brkInMins : 24 * 60 - brkInMins + brkOutMins)
    : 0
  console.log(`${d.employee.firstName} ${d.employee.lastName}`)
  console.log(`  Clock:  ${fmtPht(d.timeIn)} → ${fmtPht(d.timeOut)}`)
  console.log(`  Break:  ${fmtPht(d.breakIn)} → ${fmtPht(d.breakOut)}  (${breakDur}m)`)
  console.log(`  reg=${d.regularHours}  OT=${d.overtimeHours}  ND=${d.nightDiffHours}h\n`)
}

await prisma.$disconnect()
