import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const emp = await prisma.employee.findFirst({
  where: { employeeNo: 'LK12-20220004' },
  include: {
    company: { select: { id: true, name: true } },
    workSchedule: { include: { scheduleShifts: true } },
    shiftAssignments: {
      where: { date: { gte: new Date('2026-05-04'), lte: new Date('2026-05-10') } },
      orderBy: { date: 'asc' },
    },
  },
})
if (!emp) { console.log('not found'); process.exit(0) }
console.log('Employee:', emp.firstName, emp.lastName, '/', emp.company.name)
console.log('workScheduleId:', emp.workScheduleId)
console.log('schedule type:', emp.workSchedule?.scheduleType)
console.log('schedule timeIn/Out:', emp.workSchedule?.timeIn, '-', emp.workSchedule?.timeOut)
console.log('schedule workDays:', emp.workSchedule?.workDays)
console.log('scheduleShifts:')
for (const s of emp.workSchedule?.scheduleShifts ?? []) {
  console.log(`  - ${s.shiftName}  dow=${s.dayOfWeek}  ${s.timeIn}-${s.timeOut}  break=${s.breakMinutes}`)
}
console.log('\nshiftAssignments (May 4-10):')
for (const sa of emp.shiftAssignments) {
  console.log(`  - ${sa.date.toISOString().slice(0,10)}  ${sa.timeIn ?? '—'}-${sa.timeOut ?? '—'}  restDay=${sa.isRestDay}  scheduleId=${sa.scheduleId ?? '—'}  notes=${sa.notes ?? ''}`)
}

const dtrs = await prisma.dTRRecord.findMany({
  where: {
    employeeId: emp.id,
    date: { gte: new Date('2026-05-04'), lte: new Date('2026-05-10') },
  },
  orderBy: { date: 'asc' },
})
console.log('\n--- DTR records this week ---')
for (const d of dtrs) {
  console.log({
    date: d.date.toISOString().slice(0,10),
    timeIn:  d.timeIn?.toISOString(),
    timeOut: d.timeOut?.toISOString(),
    breakIn: d.breakIn?.toISOString(),
    breakOut: d.breakOut?.toISOString(),
    regularHours: d.regularHours?.toNumber?.(),
    lateMinutes: d.lateMinutes,
    undertimeMinutes: d.undertimeMinutes,
  })
}
await prisma.$disconnect()
