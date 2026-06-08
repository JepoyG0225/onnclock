/**
 * Loyola K-12: Michael, Paulette, and Dex were on the "PM Shift" template
 * but their actual clock-ins are 09:00 → 18:00 (an AM shift). Move them to
 * the existing "AM Shift" template, then restore "PM Shift" to a sensible
 * 12:00 → 21:00 so the template is usable for any future genuine PM workers.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const PM_SHIFT_ID = 'cmo8iks3q000310dj29k22f7h'
const AM_SHIFT_ID = 'cmo8ijgok000110djbzr7jo4g'

console.log('Before:')
const beforePm = await prisma.workSchedule.findUnique({
  where: { id: PM_SHIFT_ID },
  select: { name: true, timeIn: true, timeOut: true },
})
console.log(`  PM Shift: ${beforePm.timeIn}→${beforePm.timeOut}`)
const beforeEmps = await prisma.employee.findMany({
  where: { workScheduleId: PM_SHIFT_ID },
  select: { firstName: true, lastName: true, employeeNo: true },
})
console.log(`  PM Shift employees (${beforeEmps.length}):`)
for (const e of beforeEmps) console.log(`    ${e.employeeNo}  ${e.firstName} ${e.lastName}`)

// 1) Move PM Shift employees to AM Shift (their actual hours)
const moved = await prisma.employee.updateMany({
  where: { workScheduleId: PM_SHIFT_ID },
  data: { workScheduleId: AM_SHIFT_ID },
})

// 2) Restore PM Shift to a real PM time so the template is usable
const restoredPm = await prisma.workSchedule.update({
  where: { id: PM_SHIFT_ID },
  data: { timeIn: '12:00', timeOut: '21:00' },
  select: { name: true, timeIn: true, timeOut: true },
})

console.log('\nAfter:')
console.log(`  PM Shift: ${restoredPm.timeIn}→${restoredPm.timeOut} (now usable)`)
console.log(`  Employees moved to AM Shift: ${moved.count}`)

await prisma.$disconnect()
