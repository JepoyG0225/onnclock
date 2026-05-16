/** Find the 2 employees on COREX's latest run whose payslip ND was 0. */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const company = await prisma.company.findFirst({
  where: { name: { contains: 'corex', mode: 'insensitive' } },
  select: { id: true },
})
const run = await prisma.payrollRun.findFirst({
  where: { companyId: company.id },
  orderBy: { createdAt: 'desc' },
})
const zeroPs = await prisma.payslip.findMany({
  where: { payrollRunId: run.id, nightDiffHours: 0 },
  select: {
    employeeId: true, daysWorked: true,
    employee: { select: { firstName: true, lastName: true, employeeNo: true } },
  },
})

console.log(`Run ${run.id}: ${zeroPs.length} payslips with ND=0`)
for (const p of zeroPs) {
  const dtrs = await prisma.dTRRecord.findMany({
    where: {
      employeeId: p.employeeId,
      date: { gte: run.periodStart, lte: run.periodEnd },
    },
    select: { date: true, timeIn: true, timeOut: true, isAbsent: true },
    orderBy: { date: 'asc' },
  })
  console.log(`\n${p.employee.lastName}, ${p.employee.firstName} (${p.employee.employeeNo})`)
  console.log(`  Payslip daysWorked: ${p.daysWorked}, DTRs in period: ${dtrs.length}`)
  for (const d of dtrs) {
    const ti = d.timeIn ? new Date(d.timeIn.getTime() + 8*3600*1000).toISOString().slice(11,16) : '—'
    const to = d.timeOut ? new Date(d.timeOut.getTime() + 8*3600*1000).toISOString().slice(11,16) : '—'
    console.log(`  ${d.date.toISOString().slice(0,10)} ${ti}–${to} PHT absent=${d.isAbsent}`)
  }
}
await prisma.$disconnect()
