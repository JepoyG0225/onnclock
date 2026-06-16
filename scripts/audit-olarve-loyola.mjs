/**
 * Audit Olarve's most recent payroll payslip at Loyola against:
 *   - his DTR rows for the period (sum reg/OT/ND/late/UT/absent from raw data)
 *   - his compensation (rate type / basic salary / hourly+daily rate)
 *   - his loans / mandatory-deduction toggles
 *
 * Goal: spot any mismatch between what the payslip shows and what the DTR
 * timestamps support.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

function fmtPht(d) {
  if (!d) return '—'
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(11, 16) + ' PHT'
}
function num(d, places = 2) { return Number(d).toFixed(places) }

const company = await prisma.company.findFirst({
  where: { name: { contains: 'loyola', mode: 'insensitive' } },
  select: { id: true, name: true },
})
if (!company) { console.log('Loyola not found'); process.exit(0) }

const emp = await prisma.employee.findFirst({
  where: {
    companyId: company.id,
    OR: [
      { firstName: { contains: 'olarve', mode: 'insensitive' } },
      { lastName: { contains: 'olarve', mode: 'insensitive' } },
      { middleName: { contains: 'olarve', mode: 'insensitive' } },
    ],
  },
  include: {
    workSchedule: { select: { name: true, scheduleType: true, timeIn: true, timeOut: true, workDays: true, workHoursPerDay: true, breakMinutes: true } },
    loans: { where: { status: 'ACTIVE' }, select: { loanType: true, balance: true, monthlyAmortization: true } },
  },
})
if (!emp) { console.log('Olarve not found at Loyola'); process.exit(0) }

console.log(`\n=== ${company.name} :: ${emp.lastName}, ${emp.firstName} (${emp.employeeNo}) ===`)
console.log(`Compensation:`)
console.log(`  rateType=${emp.rateType} basicSalary=₱${num(emp.basicSalary)} dailyRate=₱${num(emp.dailyRate)} hourlyRate=₱${num(emp.hourlyRate)}`)
console.log(`  payFrequency=${emp.payFrequency} trackTime=${emp.trackTime}`)
console.log(`  Mandatory toggles: SSS=${emp.sssEnabled} PH=${emp.philhealthEnabled} HDMF=${emp.pagibigEnabled} WHT=${emp.withholdingTaxEnabled}`)
console.log(`  isMinimumWageEarner=${emp.isMinimumWageEarner} isExemptFromTax=${emp.isExemptFromTax} disableHolidayPay=${emp.disableHolidayPay}`)
console.log(`Schedule: ${emp.workSchedule?.name ?? 'FLEXIBLE'} (${emp.workSchedule?.scheduleType ?? '—'}) ${emp.workSchedule?.timeIn ?? '—'}→${emp.workSchedule?.timeOut ?? '—'}`)
console.log(`  workDays=${JSON.stringify(emp.workSchedule?.workDays)} workHoursPerDay=${emp.workSchedule?.workHoursPerDay} breakMinutes=${emp.workSchedule?.breakMinutes}`)
console.log(`Active loans: ${emp.loans.length}`)
for (const l of emp.loans) console.log(`  ${l.loanType}: balance ₱${num(l.balance)} amort ₱${num(l.monthlyAmortization)}/mo`)

// ── Pick the most recent payslip
const ps = await prisma.payslip.findFirst({
  where: { employeeId: emp.id },
  include: {
    payrollRun: {
      select: { id: true, periodStart: true, periodEnd: true, status: true, payDate: true, payFrequency: true },
    },
    incomes: { select: { typeName: true, amount: true, isTaxable: true } },
    loanDeductions: {
      include: { loan: { select: { loanType: true } } },
    },
  },
  orderBy: { createdAt: 'desc' },
})
if (!ps) { console.log('\nNo payslips yet for this employee.'); await prisma.$disconnect(); process.exit(0) }

const run = ps.payrollRun
console.log(`\n--- Latest payslip ---`)
console.log(`Run ${run.id} (${run.status}) ${run.periodStart.toISOString().slice(0,10)} → ${run.periodEnd.toISOString().slice(0,10)} payDate=${run.payDate.toISOString().slice(0,10)} freq=${run.payFrequency}`)

console.log(`\nEarnings:`)
console.log(`  basicSalary       : ₱${num(ps.basicSalary)}  (${ps.daysWorked} days, ${ps.hoursWorked} hrs)`)
console.log(`  regularOtHours    : ${ps.regularOtHours}h     → regularOtAmount     ₱${num(ps.regularOtAmount)}`)
console.log(`  restDayOtHours    : ${ps.restDayOtHours}h     → restDayOtAmount     ₱${num(ps.restDayOtAmount)}`)
console.log(`  holidayOtHours    : ${ps.holidayOtHours}h     → holidayOtAmount     ₱${num(ps.holidayOtAmount)}`)
console.log(`  nightDiffHours    : ${ps.nightDiffHours}h     → nightDiffAmount     ₱${num(ps.nightDiffAmount)}`)
console.log(`  holidayPayAmount  : ₱${num(ps.holidayPayAmount)}`)
console.log(`  otherAllowances   : ₱${num(ps.otherAllowances)}`)
console.log(`  otherEarnings     : ₱${num(ps.otherEarnings)}`)
for (const inc of ps.incomes) console.log(`    [income] ${inc.typeName}: ₱${num(inc.amount)}${inc.isTaxable ? '' : ' (non-tax)'}`)
console.log(`  grossPay          : ₱${num(ps.grossPay)}`)

console.log(`\nDeductions:`)
console.log(`  sssEmployee       : ₱${num(ps.sssEmployee)}  +ec ₱${num(ps.sssEc)}`)
console.log(`  philhealthEmployee: ₱${num(ps.philhealthEmployee)}`)
console.log(`  pagibigEmployee   : ₱${num(ps.pagibigEmployee)}`)
console.log(`  withholdingTax    : ₱${num(ps.withholdingTax)}  (taxable ₱${num(ps.taxableIncome)})`)
console.log(`  lateDeduction     : ₱${num(ps.lateDeduction)}`)
console.log(`  undertimeDeduction: ₱${num(ps.undertimeDeduction)}`)
console.log(`  absenceDeduction  : ₱${num(ps.absenceDeduction)}`)
console.log(`  sssLoanDeduction  : ₱${num(ps.sssLoanDeduction)}`)
console.log(`  pagibigLoan       : ₱${num(ps.pagibigLoan)}`)
console.log(`  companyLoan       : ₱${num(ps.companyLoan)}`)
for (const ld of ps.loanDeductions) console.log(`    [loan] ${ld.loan.loanType}: ₱${num(ld.amount)}`)
console.log(`  totalDeductions   : ₱${num(ps.totalDeductions)}`)
console.log(`\nNet pay: ₱${num(ps.netPay)}`)

// ── DTR rows for the period
const dtrs = await prisma.dTRRecord.findMany({
  where: { employeeId: emp.id, date: { gte: run.periodStart, lte: run.periodEnd } },
  orderBy: { date: 'asc' },
})
console.log(`\nDTR rows in period: ${dtrs.length}`)
let sumReg = 0, sumOt = 0, sumNd = 0, sumLate = 0, sumUt = 0, absent = 0, leavePaid = 0
for (const d of dtrs) {
  const reg = Number(d.regularHours ?? 0)
  const ot  = Number(d.overtimeHours ?? 0)
  const nd  = Number(d.nightDiffHours ?? 0)
  const late = Number(d.lateMinutes ?? 0)
  const ut   = Number(d.undertimeMinutes ?? 0)
  sumReg += reg; sumOt += ot; sumNd += nd; sumLate += late; sumUt += ut
  if (d.isAbsent) absent++
  if (d.isLeave && d.isLeavePaid) leavePaid++
  const status = d.isAbsent ? 'ABSENT' : d.isLeave ? (d.isLeavePaid ? 'LEAVE-paid' : 'LEAVE-unpaid') : 'PRESENT'
  console.log(`  ${d.date.toISOString().slice(0,10)} ${fmtPht(d.timeIn)}→${fmtPht(d.timeOut)} reg=${reg}h ot=${ot}h nd=${nd}h late=${late}m UT=${ut}m [${status}]${d.isHoliday ? ' HOL' : ''}`)
}
console.log(`\nDTR sums: reg=${num(sumReg)}h ot=${num(sumOt)}h nd=${num(sumNd)}h late=${sumLate}m UT=${sumUt}m absent=${absent} paidLeave=${leavePaid}`)
console.log(`Payslip:  reg/OT/ND hours stored — hoursWorked=${ps.hoursWorked}, regularOtHours=${ps.regularOtHours}, nightDiffHours=${ps.nightDiffHours}`)

await prisma.$disconnect()
