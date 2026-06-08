import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const emp = await prisma.employee.findFirst({
  where: { lastName: { contains: 'lazarte', mode: 'insensitive' } },
  select: {
    id: true, employeeNo: true, firstName: true, lastName: true,
    workScheduleId: true,
    workSchedule: { select: { name: true, timeIn: true, timeOut: true } },
  },
})
console.log('Employee:', JSON.stringify(emp, null, 2))

const date = new Date('2026-05-06')
const dayStart = new Date(date); dayStart.setHours(0,0,0,0)
const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)

const dtr = await prisma.dTRRecord.findFirst({
  where: { employeeId: emp.id, date: { gte: dayStart, lt: dayEnd } },
  select: { timeIn: true, timeOut: true, regularHours: true, overtimeHours: true,
    lateMinutes: true, undertimeMinutes: true },
})
console.log('\nDTR May 6:', JSON.stringify(dtr, null, 2))

const assigns = await prisma.employeeShiftAssignment.findMany({
  where: { employeeId: emp.id, date: { gte: dayStart, lt: dayEnd } },
  select: { timeIn: true, timeOut: true, isRestDay: true,
    schedule: { select: { name: true, timeIn: true, timeOut: true } } },
})
console.log('\nPer-date assignments for May 6:')
for (const a of assigns) {
  console.log(`  ${a.timeIn || a.schedule?.timeIn}→${a.timeOut || a.schedule?.timeOut}  rest=${a.isRestDay}  template=${a.schedule?.name}`)
}

await prisma.$disconnect()
