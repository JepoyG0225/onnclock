import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const payslips = await p.payslip.findMany({
  where: { payrollRunId: 'cmp3gwlkg0003132u5v9w5k0d' },
  select: {
    employee: { select: { firstName: true, lastName: true, basicSalary: true } },
    basicSalary: true, daysWorked: true, regularOtAmount: true, nightDiffAmount: true,
    grossPay: true,
    sssEmployee: true, philhealthEmployee: true, pagibigEmployee: true,
    withholdingTax: true, totalDeductions: true, netPay: true,
  },
  orderBy: { netPay: 'desc' },
  take: 5,
})
console.log('Top 5 payslips by net pay:\n')
for (const ps of payslips) {
  console.log(`${ps.employee.firstName} ${ps.employee.lastName}  (monthly ₱${ps.employee.basicSalary})`)
  console.log(`  basicSalary=₱${ps.basicSalary} daysWorked=${ps.daysWorked}  ND=${ps.nightDiffAmount}  gross=${ps.grossPay}`)
  console.log(`  SSS=${ps.sssEmployee}  PH=${ps.philhealthEmployee}  PagIBIG=${ps.pagibigEmployee}  WTax=${ps.withholdingTax}`)
  console.log(`  totalDeductions=${ps.totalDeductions}  netPay=${ps.netPay}\n`)
}
await p.$disconnect()
