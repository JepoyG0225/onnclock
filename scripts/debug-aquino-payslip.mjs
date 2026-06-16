import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const co = await p.company.findFirst({ where: { name: { contains: 'LOYOLA' } } })
const ps = await p.payslip.findFirst({
  where: { employee: { firstName: { contains: 'CRISTINA' } }, payrollRun: { companyId: co.id } },
  orderBy: { createdAt: 'desc' },
  include: {
    employee: { include: { incomeAssignments: { include: { incomeType: true } } } },
    incomes: { include: { incomeType: true } },
    payrollRun: true,
  },
})
if (!ps) { console.log('no payslip'); process.exit(0) }

console.log('Run:', ps.payrollRun.id, ps.payrollRun.periodStart.toISOString().slice(0,10), '→', ps.payrollRun.periodEnd.toISOString().slice(0,10))
console.log('\nEmployee:', ps.employee.firstName, ps.employee.lastName, 'rateType:', ps.employee.rateType, 'basicSalary:', ps.employee.basicSalary.toString())

console.log('\nIncome assignments:')
for (const a of ps.employee.incomeAssignments) {
  console.log(`  - ${a.incomeType.name}  mode=${a.incomeType.mode}  isActive=${a.isActive}  isTaxable=${a.incomeType.isTaxable}  fixedAmount=${a.fixedAmount}  defaultAmount=${a.incomeType.defaultAmount}`)
}

console.log('\nPayslip incomes (line items):')
for (const i of ps.incomes) {
  console.log(`  - ${i.typeName}  amount=${i.amount}  isTaxable=${i.isTaxable}`)
}

console.log('\nVariable entries this run:')
const varEntries = await p.payrollRunIncomeEntry.findMany({
  where: { payrollRunId: ps.payrollRunId, employeeId: ps.employeeId },
  include: { incomeType: true },
})
for (const v of varEntries) {
  console.log(`  - ${v.incomeType.name}  amount=${v.amount}`)
}

console.log('\nPayslip fields:')
const fields = ['basicSalary','daysWorked','regularOtAmount','holidayPayAmount','nightDiffAmount','riceAllowance','clothingAllowance','medicalAllowance','otherAllowances','otherEarnings','grossPay','taxableIncome','nonTaxableIncome','totalDeductions','netPay']
for (const f of fields) console.log(`  ${f}: ${ps[f]?.toString?.() ?? ps[f]}`)

await p.$disconnect()
