import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const co = await prisma.company.findFirst({ where: { name: { contains: 'COREX' } } })
console.log('Company:', co.name, co.id)

const latestRun = await prisma.payrollRun.findFirst({
  where: { companyId: co.id },
  orderBy: { createdAt: 'desc' },
  include: {
    payslips: { include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNo: true, rateType: true, basicSalary: true } } } },
  },
})
console.log('\nLatest run:', latestRun.id)
console.log('  period:', latestRun.periodStart.toISOString().slice(0,10), '→', latestRun.periodEnd.toISOString().slice(0,10))

const holidays = await prisma.holiday.findMany({
  where: { companyId: co.id, date: { gte: latestRun.periodStart, lte: latestRun.periodEnd } },
  orderBy: { date: 'asc' },
})
const holidayDates = holidays.map(h => h.date.toISOString().slice(0,10))
console.log('\nHolidays:')
for (const h of holidays) {
  console.log(`  ${h.date.toISOString().slice(0,10)}  [${h.type}]  ${h.name}`)
}

// For ALL employees, count their DTR records that fall on holidays
console.log('\n--- Per-employee DTRs on holidays ---')
for (const ps of latestRun.payslips) {
  const dtrs = await prisma.dTRRecord.findMany({
    where: {
      employeeId: ps.employeeId,
      date: { in: holidays.map(h => h.date) },
    },
    orderBy: { date: 'asc' },
  })
  if (dtrs.length === 0) {
    // Print just rateType + holidayPay to spot patterns
    console.log(`  ${ps.employee.lastName}, ${ps.employee.firstName} (${ps.employee.rateType})  no holiday DTR  holidayPay=${ps.holidayPayAmount}  worked=${ps.daysWorked}`)
    continue
  }
  console.log(`  ${ps.employee.lastName}, ${ps.employee.firstName} (${ps.employee.rateType})  holidayPay=${ps.holidayPayAmount}`)
  for (const d of dtrs) {
    const hType = holidays.find(h => h.date.toISOString().slice(0,10) === d.date.toISOString().slice(0,10))?.type
    console.log(`     ${d.date.toISOString().slice(0,10)} (${hType})  isHoliday=${d.isHoliday}  worked=${!!d.timeIn}  abs=${d.isAbsent}  hours=${d.regularHours?.toString()}`)
  }
}

await prisma.$disconnect()
