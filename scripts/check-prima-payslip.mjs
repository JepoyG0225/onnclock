import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const co = await prisma.company.findFirst({ where: { name: { contains: 'COREX' } } })

const ps = await prisma.payslip.findFirst({
  where: { employee: { firstName: 'PRIMA' }, payrollRun: { companyId: co.id } },
  orderBy: { createdAt: 'desc' },
  include: { payrollRun: true },
})

console.log('Period:', ps.payrollRun.periodStart.toISOString().slice(0,10), '→', ps.payrollRun.periodEnd.toISOString().slice(0,10))
console.log('payFreq:', ps.payrollRun.payFrequency)

const fields = [
  'basicSalary', 'daysWorked',
  'regularHours', 'overtimeHours',
  'regularOtAmount', 'restDayOtAmount', 'holidayOtAmount',
  'nightDiffAmount', 'holidayPayAmount',
  'allowances', 'riceAllowance', 'clothingAllowance', 'medicalAllowance', 'otherAllowances',
  'lateMinutes', 'lateDeduction',
  'undertimeMinutes', 'undertimeDeduction',
  'absentDays', 'absenceDeduction',
  'sssEmployee', 'philhealthEmployee', 'pagibigEmployee',
  'withholdingTax',
  'totalDeductions',
  'grossPay', 'netPay',
  'taxableIncome', 'nonTaxableIncome',
  'thirteenthMonthContribution',
]
for (const f of fields) {
  if (f in ps && ps[f] != null) {
    const v = typeof ps[f] === 'object' && 'toString' in ps[f] ? ps[f].toString() : ps[f]
    console.log(' ', f.padEnd(30), v)
  }
}

// Count working days in period (Mon-Fri)
const start = ps.payrollRun.periodStart
const end = ps.payrollRun.periodEnd
let workDays = 0, totalDays = 0
const cur = new Date(start)
while (cur <= end) {
  totalDays++
  const dow = cur.getDay()
  if (dow !== 0 && dow !== 6) workDays++
  cur.setDate(cur.getDate() + 1)
}
console.log('\nPeriod calendar days:', totalDays, ' Mon-Fri days:', workDays)

// Holidays in period
const holidays = await prisma.holiday.findMany({
  where: { companyId: co.id, date: { gte: start, lte: end } },
  orderBy: { date: 'asc' },
})
const holidaysOnWeekday = holidays.filter(h => {
  const d = h.date.getDay()
  return d !== 0 && d !== 6
})
console.log('Holidays in period:', holidays.length, '(weekday holidays:', holidaysOnWeekday.length, ')')
console.log('  Mon-Fri excluding holidays:', workDays - holidaysOnWeekday.length)

// PRIMA's DTRs
const dtrs = await prisma.dTRRecord.findMany({
  where: { employeeId: ps.employeeId, date: { gte: start, lte: end } },
  orderBy: { date: 'asc' },
})
console.log('\nPRIMA DTR count:', dtrs.length)
for (const d of dtrs) {
  console.log(`  ${d.date.toISOString().slice(0,10)}  in=${d.timeIn?.toISOString().slice(11,16) ?? '—'}  out=${d.timeOut?.toISOString().slice(11,16) ?? '—'}  holiday=${d.isHoliday}  abs=${d.isAbsent}  hours=${d.regularHours?.toString()}`)
}

// Expected basic pay calculation
const monthly = 10500
const semi = monthly / 2  // = 5250
console.log('\n--- Expected vs Actual ---')
console.log('Monthly salary:', monthly)
console.log('Semi-monthly (raw):', semi)
console.log('Working days in period (Mon-Fri):', workDays)
console.log('  → daily rate (semi/wd):', (semi / workDays).toFixed(2))
console.log('  → basicPay if daysWorked=6:', (semi / workDays * 6).toFixed(2))
console.log('Working days excluding holidays:', workDays - holidaysOnWeekday.length)
console.log('  → daily rate (semi/wd-h):', (semi / (workDays - holidaysOnWeekday.length)).toFixed(2))
console.log('  → basicPay if daysWorked=6:', (semi / (workDays - holidaysOnWeekday.length) * 6).toFixed(2))
console.log('  → basicPay if daysWorked=10 (incl holidays):', (semi / workDays * 10).toFixed(2))

await prisma.$disconnect()
