import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const co = await prisma.company.findFirst({ where: { name: { contains: 'LOYOLA' } }, select: { id: true, name: true } })
console.log('Company:', co.name, co.id)

const schedules = await prisma.workSchedule.findMany({
  where: { companyId: co.id, isActive: true },
  include: { scheduleShifts: true },
})
console.log('\nWorkSchedules:')
for (const s of schedules) {
  console.log(`  • ${s.name} (${s.scheduleType}) — ${s.timeIn ?? '—'}-${s.timeOut ?? '—'}  break=${s.breakMinutes}min  workDays=${JSON.stringify(s.workDays)}`)
  for (const ss of s.scheduleShifts) {
    console.log(`     ↳ shift ${ss.shiftName}  dow=${ss.dayOfWeek}  ${ss.timeIn}-${ss.timeOut}`)
  }
}

// Anyone with shift on Mon May 4 starting around 07:05?
const may4 = new Date('2026-05-04T00:00:00.000Z')
const all = await prisma.employeeShiftAssignment.findMany({
  where: { companyId: co.id, date: may4 },
  include: { employee: { select: { firstName: true, lastName: true, employeeNo: true } } },
})
console.log(`\nAll EmployeeShiftAssignments on May 4: ${all.length}`)
for (const a of all.slice(0, 10)) {
  console.log(`  - ${a.employee.lastName}, ${a.employee.firstName} (${a.employee.employeeNo})  ${a.timeIn ?? '—'}-${a.timeOut ?? '—'}  rest=${a.isRestDay}`)
}

// Veronica audit log? Maybe there used to be a 07:00 shift
console.log('\n(Veronica had lateMinutes=89 stored on her May 4 DTR but no shift assignment present now — likely a stale value from a previously-set 07:05 shift that was later deleted)')

await prisma.$disconnect()
