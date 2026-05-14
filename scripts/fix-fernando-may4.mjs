/**
 * Veronica Fernando (LK12-20220004) has lateMinutes=89 stored on her
 * 2026-05-04 DTR, but:
 *   - she has no workScheduleId
 *   - she has no EmployeeShiftAssignment for that date
 *   - her other days that week (May 6, 7, 8) with identical 08:30–08:56
 *     clock-ins all show late=0
 * The 89-minute value is stale — left over from a since-deleted shift
 * assignment that targeted ~07:05. Clear it.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const emp = await prisma.employee.findFirst({
  where: { employeeNo: 'LK12-20220004' },
  select: { id: true },
})
if (!emp) { console.error('not found'); process.exit(1) }

const dtr = await prisma.dTRRecord.findFirst({
  where: { employeeId: emp.id, date: new Date('2026-05-04T00:00:00.000Z') },
  select: { id: true, lateMinutes: true, undertimeMinutes: true, regularHours: true },
})
if (!dtr) { console.error('no DTR for May 4'); process.exit(1) }
console.log('Before:', dtr)

await prisma.dTRRecord.update({
  where: { id: dtr.id },
  data: { lateMinutes: 0, undertimeMinutes: 0 },
})

const after = await prisma.dTRRecord.findUnique({
  where: { id: dtr.id },
  select: { lateMinutes: true, undertimeMinutes: true, regularHours: true },
})
console.log('After: ', after)
console.log('✅ Done — stale late tag cleared for Veronica May 4')

await prisma.$disconnect()
