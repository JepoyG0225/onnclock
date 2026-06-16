/**
 * Audit: across all companies, find DTR records that fall on a regular
 * or special non-working holiday AND have timeIn (employee actually
 * clocked in). For each, sanity-check that the corresponding payslip
 * shows the correct premium:
 *
 *   REGULAR holiday worked        → +100% of dailyRate as premium
 *   SPECIAL non-working worked    → +30%  of dailyRate as premium
 *   REGULAR holiday NOT worked    → +100% (Art. 94) for DAILY/HOURLY,
 *                                    reclassified line for MONTHLY
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const holidays = await prisma.holiday.findMany({
  where: { type: { in: ['REGULAR', 'SPECIAL_NON_WORKING'] } },
})
const byKey = new Map(holidays.map(h => [`${h.companyId}:${h.date.toISOString().slice(0,10)}`, h]))
console.log(`${holidays.length} holiday rows across all companies\n`)

// Find every DTR that lands on a holiday date (per the company)
const allDtrs = await prisma.dTRRecord.findMany({
  where: { timeIn: { not: null } },
  include: { employee: { select: { id: true, companyId: true, firstName: true, lastName: true, rateType: true, basicSalary: true, dailyRate: true } } },
})
const workedOnHoliday = allDtrs.filter(d => {
  const key = `${d.employee.companyId}:${d.date.toISOString().slice(0,10)}`
  return byKey.has(key)
})
console.log(`${workedOnHoliday.length} DTRs have timeIn AND fall on a holiday\n`)

for (const d of workedOnHoliday) {
  const h = byKey.get(`${d.employee.companyId}:${d.date.toISOString().slice(0,10)}`)
  const company = await prisma.company.findUnique({ where: { id: d.employee.companyId }, select: { name: true } })
  console.log(`${company.name}  ${d.date.toISOString().slice(0,10)}  ${h.type}  ${h.name}`)
  console.log(`  Employee: ${d.employee.lastName}, ${d.employee.firstName}  [${d.employee.rateType}]  basicSalary=₱${d.employee.basicSalary}  dailyRate=₱${d.employee.dailyRate ?? '(auto)'}`)
  console.log(`  Clock: ${d.timeIn?.toISOString().slice(11,19)}Z → ${d.timeOut?.toISOString().slice(11,19) ?? 'still in'}Z  abs=${d.isAbsent}`)

  // Find the payslip that covers this date
  const ps = await prisma.payslip.findFirst({
    where: {
      employeeId: d.employee.id,
      payrollRun: { periodStart: { lte: d.date }, periodEnd: { gte: d.date } },
    },
  })
  if (!ps) { console.log(`  ⚠ No payslip covers this date yet\n`); continue }
  console.log(`  Payslip: basic=₱${ps.basicSalary}  holidayPay=₱${ps.holidayPayAmount}  daysWorked=${ps.daysWorked}`)

  // Expected premium
  const daily = d.employee.dailyRate ? Number(d.employee.dailyRate) : Number(d.employee.basicSalary) / 22
  const expectedPremium = h.type === 'REGULAR' ? daily : daily * 0.3
  console.log(`  Expected premium for this day: ₱${expectedPremium.toFixed(2)} (${h.type === 'REGULAR' ? '+100%' : '+30%'} of daily ₱${daily.toFixed(2)})\n`)
}

await prisma.$disconnect()
