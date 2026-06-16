import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const SCHED_ID = 'cmo8iks3q000310dj29k22f7h'
const sched = await prisma.workSchedule.findUnique({
  where: { id: SCHED_ID },
  select: { id: true, name: true, timeIn: true, timeOut: true, companyId: true,
    company: { select: { name: true } } },
})
console.log('Template:', JSON.stringify(sched, null, 2))

const emps = await prisma.employee.findMany({
  where: { workScheduleId: SCHED_ID },
  select: { id: true, employeeNo: true, firstName: true, lastName: true, isActive: true },
})
console.log(`\nEmployees on this template: ${emps.length}`)
for (const e of emps) {
  console.log(`  ${(e.employeeNo ?? '—').padEnd(15)} ${e.firstName} ${e.lastName}  ${e.isActive ? '' : '(inactive)'}`)
}

// Also see what other templates exist for the company so we can compare
const otherSchedules = await prisma.workSchedule.findMany({
  where: { companyId: sched.companyId, id: { not: SCHED_ID } },
  select: { id: true, name: true, timeIn: true, timeOut: true,
    _count: { select: { employees: true } } },
  orderBy: { name: 'asc' },
})
console.log(`\nOther schedules in company:`)
for (const s of otherSchedules) {
  console.log(`  ${s.id}  ${s.name.padEnd(30)} ${s.timeIn}→${s.timeOut}  emp=${s._count.employees}`)
}

await prisma.$disconnect()
