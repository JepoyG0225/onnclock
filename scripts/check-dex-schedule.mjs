import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const emp = await prisma.employee.findFirst({
  where: { lastName: { contains: 'catacutan', mode: 'insensitive' } },
  select: {
    id: true, employeeNo: true, firstName: true, lastName: true,
    workScheduleId: true,
    workSchedule: { select: { id: true, name: true, timeIn: true, timeOut: true, breakMinutes: true } },
    company: { select: { name: true } },
  },
})
if (!emp) { console.log('Not found'); process.exit(1) }
console.log('Employee:', JSON.stringify(emp, null, 2))

const since = new Date(); since.setDate(since.getDate() - 14)
const assigns = await prisma.employeeShiftAssignment.findMany({
  where: { employeeId: emp.id, date: { gte: since } },
  select: { date: true, timeIn: true, timeOut: true, isRestDay: true,
    schedule: { select: { name: true, timeIn: true, timeOut: true } } },
  orderBy: { date: 'desc' },
})
console.log(`\n=== Per-date assignments (past 14d): ${assigns.length} ===`)
for (const a of assigns) {
  const t = a.timeIn || a.schedule?.timeIn || '—'
  const o = a.timeOut || a.schedule?.timeOut || '—'
  console.log(`  ${a.date.toISOString().slice(0,10)}  ${t}→${o}  rest=${a.isRestDay}  template=${a.schedule?.name ?? 'override'}`)
}

const dtrs = await prisma.dTRRecord.findMany({
  where: { employeeId: emp.id, date: { gte: since } },
  select: { date: true, timeIn: true, timeOut: true, regularHours: true, overtimeHours: true,
    nightDiffHours: true, lateMinutes: true, undertimeMinutes: true },
  orderBy: { date: 'desc' },
})
console.log(`\n=== DTRs (past 14d): ${dtrs.length} ===`)
for (const d of dtrs) {
  console.log(`  ${d.date.toISOString().slice(0,10)}  in=${d.timeIn?.toISOString() ?? '—'}  out=${d.timeOut?.toISOString() ?? '—'}  reg=${d.regularHours} OT=${d.overtimeHours} late=${d.lateMinutes}m UT=${d.undertimeMinutes}m`)
}

await prisma.$disconnect()
