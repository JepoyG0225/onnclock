import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const emp = await prisma.employee.findFirst({
  where: { firstName: { contains: 'ALEXA', mode: 'insensitive' }, lastName: { contains: 'ARELLANO', mode: 'insensitive' } },
})
const p = await prisma.payslip.findFirst({
  where: { employeeId: emp.id, payrollRun: { periodStart: { gte: new Date('2026-05-16') } } },
  include: { incomes: true, loanDeductions: true, payrollRun: { select: { periodLabel: true } } },
})
console.log('Period:', p.payrollRun.periodLabel)
const f = [
  'basicSalary','dailyRate','daysWorked','hoursWorked',
  'regularOtHours','regularOtAmount','restDayOtHours','restDayOtAmount',
  'holidayOtHours','holidayOtAmount','nightDiffHours','nightDiffAmount',
  'holidayPayAmount','riceAllowance','clothingAllowance','medicalAllowance','otherAllowances','otherEarnings',
  'grossPay',
  'sssEmployee','philhealthEmployee','pagibigEmployee','withholdingTax',
  'lateDeduction','undertimeDeduction','absenceDeduction','otherDeductions',
  'totalDeductions','netPay',
]
for (const k of f) console.log(k.padEnd(22), p[k]?.toString())
console.log('\nmanualEdits:', JSON.stringify(p.manualEdits, null, 2))
console.log('\nincomes:', p.incomes.map(i => ({ name: i.label ?? i.name, amount: i.amount?.toString(), taxable: i.taxable })))
console.log('\nloanDeductions:', p.loanDeductions.map(l => ({ label: l.label, amount: l.amount?.toString() })))

// Sum earnings manually
const earningsKeys = ['basicSalary','regularOtAmount','restDayOtAmount','holidayOtAmount','nightDiffAmount','holidayPayAmount','riceAllowance','clothingAllowance','medicalAllowance','otherAllowances','otherEarnings']
const sum = earningsKeys.reduce((s, k) => s + Number(p[k] ?? 0), 0)
const incomeSum = p.incomes.reduce((s, i) => s + Number(i.amount ?? 0), 0)
console.log('\nSum of structured earnings columns:', sum)
console.log('Sum of incomes table:', incomeSum)
console.log('grossPay in DB:', Number(p.grossPay))
console.log('Diff (gross - structured):', Number(p.grossPay) - sum)
console.log('Diff (gross - structured - incomes):', Number(p.grossPay) - sum - incomeSum)
process.exit(0)
