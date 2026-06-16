/**
 * Audit "other income" doubling on Loyola K-12 payroll runs. Compare:
 *   - PayrollRunIncomeEntry rows (one per employee × incomeType)
 *   - PayslipIncome rows (line items written when payroll computes)
 *   - Payslip.otherEarnings totals
 * Flag any mismatch / duplicates.
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const co = await p.company.findFirst({ where: { name: { contains: 'LOYOLA' } } })
console.log('Company:', co.name, co.id)

const latestRun = await p.payrollRun.findFirst({
  where: { companyId: co.id },
  orderBy: { createdAt: 'desc' },
  include: {
    payslips: {
      include: {
        employee: { select: { firstName: true, lastName: true } },
        incomes: { include: { incomeType: { select: { name: true, mode: true } } } },
      },
    },
  },
})
console.log('Latest run:', latestRun.id, ' period', latestRun.periodStart.toISOString().slice(0,10), '→', latestRun.periodEnd.toISOString().slice(0,10), ' status', latestRun.status)

// Pre-stored variable income entries
const preEntries = await p.payrollRunIncomeEntry.findMany({
  where: { payrollRunId: latestRun.id },
  include: {
    employee: { select: { firstName: true, lastName: true } },
    incomeType: { select: { name: true, mode: true } },
  },
})

// Group preEntries by (employeeId, incomeTypeId) and look for duplicates
const preGroups = new Map()
for (const e of preEntries) {
  const k = `${e.employeeId}:${e.incomeTypeId}`
  if (!preGroups.has(k)) preGroups.set(k, [])
  preGroups.get(k).push(e)
}
const preDups = [...preGroups.entries()].filter(([_, arr]) => arr.length > 1)
console.log(`\nPayrollRunIncomeEntry rows: ${preEntries.length}, duplicate (emp×type) groups: ${preDups.length}`)
for (const [k, arr] of preDups) console.log(`  DUP entries (${arr.length}×) ${k} : ${arr.map(e => e.amount.toString()).join(', ')}`)

// Per-payslip income line items
console.log('\nPayslipIncome breakdown per employee:')
let problemFound = 0
for (const ps of latestRun.payslips) {
  if (ps.incomes.length === 0) continue
  // Group by incomeType to detect dups
  const byType = new Map()
  for (const i of ps.incomes) {
    if (!byType.has(i.incomeTypeId)) byType.set(i.incomeTypeId, [])
    byType.get(i.incomeTypeId).push(i)
  }
  const dups = [...byType.entries()].filter(([_, arr]) => arr.length > 1)
  const flag = dups.length > 0 ? '  ⚠ DUPLICATE' : ''
  if (dups.length > 0) problemFound++
  console.log(`  ${ps.employee.lastName}, ${ps.employee.firstName}  otherEarnings=₱${ps.otherEarnings}  incomes=[${ps.incomes.map(i => `${i.typeName}=₱${i.amount}`).join(', ')}]${flag}`)
}

console.log(`\n${problemFound} payslips have duplicate income line items`)

// Also check IncomeType assignments on the company side
console.log('\nIncome assignments per employee:')
const employees = await p.employee.findMany({
  where: { companyId: co.id, isActive: true },
  include: {
    incomeAssignments: {
      include: { incomeType: { select: { name: true, mode: true } } },
    },
  },
})
let assignDups = 0
for (const e of employees) {
  if (e.incomeAssignments.length === 0) continue
  const byType = new Map()
  for (const a of e.incomeAssignments) {
    if (!byType.has(a.incomeTypeId)) byType.set(a.incomeTypeId, [])
    byType.get(a.incomeTypeId).push(a)
  }
  const dups = [...byType.entries()].filter(([_, arr]) => arr.length > 1)
  if (dups.length > 0) {
    assignDups++
    console.log(`  ⚠ ${e.lastName}, ${e.firstName}  has duplicate income-type assignments:`)
    for (const [tid, arr] of dups) {
      console.log(`     - ${arr[0].incomeType.name}  ×${arr.length}  isActive=${arr.map(a => a.isActive).join('/')}  fixed=${arr.map(a => a.fixedAmount).join('/')}`)
    }
  }
}
console.log(`\n${assignDups} employees have duplicate income-type assignments`)

await p.$disconnect()
