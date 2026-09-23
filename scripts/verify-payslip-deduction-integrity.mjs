/**
 * Payslip deduction invariants. Read-only — run after any payroll run or
 * data correction.
 *
 *   1. totalDeductions must equal the sum of the EMPLOYEE-borne components.
 *      `sssEc` is excluded on purpose: Employees' Compensation is 100%
 *      employer-borne (PD 626) and must never reduce an employee's net pay.
 *   2. netPay must equal grossPay - totalDeductions.
 *
 * Exits non-zero when either invariant is violated.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const n = v => Number(v)

const slips = await prisma.payslip.findMany({
  select: { id:true, sssEc:true, grossPay:true, totalDeductions:true, netPay:true,
    sssEmployee:true, philhealthEmployee:true, pagibigEmployee:true, withholdingTax:true,
    sssLoanDeduction:true, pagibigLoan:true, companyLoan:true,
    lateDeduction:true, undertimeDeduction:true, absenceDeduction:true, otherDeductions:true,
    payrollRun: { select: { id: true, status: true } } },
})

const ecLeak = [], netBad = []
for (const p of slips) {
  const cols = n(p.sssEmployee)+n(p.philhealthEmployee)+n(p.pagibigEmployee)+n(p.withholdingTax)
    +n(p.sssLoanDeduction)+n(p.pagibigLoan)+n(p.companyLoan)
    +n(p.lateDeduction)+n(p.undertimeDeduction)+n(p.absenceDeduction)+n(p.otherDeductions)
  // The signature of an EC leak: the total overshoots the components by exactly the EC.
  if (n(p.sssEc) > 0 && Math.abs(n(p.totalDeductions) - (cols + n(p.sssEc))) <= 0.01) ecLeak.push(p)
  if (Math.abs((n(p.grossPay) - n(p.totalDeductions)) - n(p.netPay)) > 0.01) netBad.push(p)
}

console.log(`payslips checked: ${slips.length}`)
console.log(`employer-borne SSS EC charged to employee: ${ecLeak.length}`)
console.log(`netPay != grossPay - totalDeductions:      ${netBad.length}`)
for (const p of ecLeak.slice(0, 10)) console.log(`   EC LEAK ${p.id} run=${p.payrollRun.id} (${p.payrollRun.status}) ec=${n(p.sssEc)}`)
for (const p of netBad.slice(0, 10)) console.log(`   NET     ${p.id} gross=${n(p.grossPay)} ded=${n(p.totalDeductions)} net=${n(p.netPay)}`)

await prisma.$disconnect()
if (ecLeak.length || netBad.length) process.exit(1)
console.log('OK — all invariants hold.')
