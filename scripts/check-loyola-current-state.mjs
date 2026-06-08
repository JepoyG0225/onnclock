import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const PM_SHIFT_ID = 'cmo8iks3q000310dj29k22f7h'
const AM_SHIFT_ID = 'cmo8ijgok000110djbzr7jo4g'

const pm = await prisma.workSchedule.findUnique({
  where: { id: PM_SHIFT_ID },
  select: { name: true, timeIn: true, timeOut: true, breakMinutes: true, _count: { select: { employees: true } } },
})
const am = await prisma.workSchedule.findUnique({
  where: { id: AM_SHIFT_ID },
  select: { name: true, timeIn: true, timeOut: true, breakMinutes: true, _count: { select: { employees: true } } },
})
console.log('Current state:')
console.log(`  PM Shift: ${pm.timeIn}→${pm.timeOut}  break=${pm.breakMinutes}m  employees=${pm._count.employees}`)
console.log(`  AM Shift: ${am.timeIn}→${am.timeOut}  break=${am.breakMinutes}m  employees=${am._count.employees}`)

console.log('\nEmployees on PM Shift right now:')
const pmEmps = await prisma.employee.findMany({
  where: { workScheduleId: PM_SHIFT_ID },
  select: { employeeNo: true, firstName: true, lastName: true },
})
for (const e of pmEmps) console.log(`  ${e.employeeNo}  ${e.firstName} ${e.lastName}`)

console.log('\nEmployees on AM Shift right now:')
const amEmps = await prisma.employee.findMany({
  where: { workScheduleId: AM_SHIFT_ID },
  select: { employeeNo: true, firstName: true, lastName: true },
})
for (const e of amEmps) console.log(`  ${e.employeeNo}  ${e.firstName} ${e.lastName}`)

await prisma.$disconnect()
