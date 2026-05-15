import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const co = await prisma.company.findFirst({ where: { name: { contains: 'COREX' } } })
const emp = await prisma.employee.findFirst({
  where: { firstName: 'PRIMA', companyId: co.id },
  include: {
    incomeAssignments: { include: { incomeType: true } },
  },
})
console.log('Employee:', emp.firstName, emp.lastName, ' rateType:', emp.rateType, ' trackTime:', emp.trackTime, ' basicSalary:', emp.basicSalary.toString())
console.log('\nIncome assignments:')
for (const a of emp.incomeAssignments) {
  console.log(`  ${a.incomeType.name}  mode=${a.incomeType.mode}  defaultAmount=${a.incomeType.defaultAmount?.toString()}  fixedAmount=${a.fixedAmount?.toString()}  taxable=${a.incomeType.isTaxable}`)
}

// Payslip income breakdown
const ps = await prisma.payslip.findFirst({
  where: { employeeId: emp.id, payrollRun: { companyId: co.id } },
  orderBy: { createdAt: 'desc' },
  include: { incomes: { include: { incomeType: true } } },
})
console.log('\nPayslip incomes:')
for (const i of ps.incomes) {
  console.log(`  ${i.typeName}  amount=${i.amount.toString()}  taxable=${i.isTaxable}`)
}
console.log('\nFull payslip:')
console.log('  basicSalary:', ps.basicSalary.toString())
console.log('  daysWorked:', ps.daysWorked.toString())
console.log('  hoursWorked:', ps.hoursWorked.toString())
console.log('  grossPay:', ps.grossPay.toString())
console.log('  nightDiffAmount:', ps.nightDiffAmount.toString())
console.log('  holidayPayAmount:', ps.holidayPayAmount.toString())
console.log('  otherEarnings:', ps.otherEarnings.toString())
console.log('  riceAllowance:', ps.riceAllowance.toString())

await prisma.$disconnect()
