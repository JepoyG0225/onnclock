/**
 * Audit which companies / runs now show a non-zero holidayPayAmount on
 * payslips, and verify whether that's correct (i.e. the run period
 * actually contains holidays).
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const runs = await p.payrollRun.findMany({
  where: {
    payslips: {
      some: { holidayPayAmount: { gt: 0 } },
    },
  },
  include: {
    company: { select: { name: true } },
    payslips: {
      where: { holidayPayAmount: { gt: 0 } },
      include: { employee: { select: { firstName: true, lastName: true, rateType: true } } },
    },
  },
  orderBy: { createdAt: 'desc' },
})

console.log(`${runs.length} payroll run(s) have at least one payslip with holidayPayAmount > 0\n`)

for (const run of runs) {
  // Find regular holidays in this run's period
  const holidays = await p.holiday.findMany({
    where: {
      companyId: run.companyId,
      type: 'REGULAR',
      date: { gte: run.periodStart, lte: run.periodEnd },
    },
  })
  console.log('───────────────────────────────────────────────────────────────')
  console.log(`${run.company.name}   period ${run.periodStart.toISOString().slice(0,10)} → ${run.periodEnd.toISOString().slice(0,10)}   status ${run.status}`)
  console.log(`  Regular holidays in period: ${holidays.length}` + (holidays.length ? `  (${holidays.map(h => h.date.toISOString().slice(0,10) + ' ' + h.name).join(', ')})` : ''))
  console.log(`  Payslips with holidayPayAmount > 0: ${run.payslips.length}`)
  // Show top 5
  for (const ps of run.payslips.slice(0, 5)) {
    console.log(`     ${ps.employee.lastName}, ${ps.employee.firstName}  [${ps.employee.rateType}]  basic=${ps.basicSalary}  holidayPay=${ps.holidayPayAmount}  gross=${ps.grossPay}`)
  }
  if (run.payslips.length > 5) console.log(`     ... and ${run.payslips.length - 5} more`)
}

await p.$disconnect()
