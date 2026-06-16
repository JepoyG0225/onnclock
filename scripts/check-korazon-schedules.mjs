import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const co = await p.company.findFirst({ where: { name: { contains: 'KORAZON', mode: 'insensitive' } } })
if (!co) { console.log('Korazon not found'); process.exit(0) }
console.log('Company:', co.name, co.id)

const schedules = await p.workSchedule.findMany({
  where: { companyId: co.id },
  include: { _count: { select: { employees: true } } },
})
console.log(`\nWork schedules (${schedules.length}):`)
for (const s of schedules) {
  console.log(`  ${s.name}  type=${s.scheduleType}  active=${s.isActive}  timeIn=${s.timeIn ?? '-'}  timeOut=${s.timeOut ?? '-'}  employees=${s._count.employees}`)
}

console.log('\nEmployees and their schedule assignment:')
const emps = await p.employee.findMany({
  where: { companyId: co.id, isActive: true },
  include: { workSchedule: true },
})
for (const e of emps) {
  console.log(`  ${e.lastName}, ${e.firstName}  workScheduleId=${e.workScheduleId ?? 'NONE'}  schedule=${e.workSchedule?.name ?? '-'}  type=${e.workSchedule?.scheduleType ?? '-'}`)
}

await p.$disconnect()
