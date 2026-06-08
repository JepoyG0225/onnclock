/**
 * Recompute every non-LOCKED payroll run that had over-paid holiday
 * pay due to the duplicate-holiday bug. After scripts/dedupe-holidays.mjs
 * cleaned the underlying data, this kicks each affected run through the
 * compute endpoint so the payslip totals get updated.
 *
 * LOCKED runs are skipped — the over-pay there is already disbursed and
 * recomputing would be misleading. HR can issue a one-off correction
 * adjustment if they want to reverse it.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const KEY = '6218ea2d55f33b30b166fde611bf5e13d9bcd72a5f9dd16b'

// Companies that had duplicate holidays — names are matched via contains
// to tolerate "INC.", "TUTORIAL SERVICES", etc.
const affectedCompanyMatch = ['LOYOLA K-12', 'Pagdanganan Law', 'Nexus', 'FM Services', 'COREX']

const runs = await prisma.payrollRun.findMany({
  where: {
    company: { OR: affectedCompanyMatch.map(name => ({ name: { contains: name } })) },
    status: { in: ['DRAFT', 'COMPUTED', 'FOR_APPROVAL'] },
  },
  include: {
    company: { select: { id: true, name: true } },
    _count: { select: { payslips: true } },
  },
  orderBy: [{ companyId: 'asc' }, { periodStart: 'desc' }],
})

console.log(`${runs.length} non-LOCKED runs to recompute\n`)

for (const run of runs) {
  process.stdout.write(`${run.company.name.padEnd(35)} ${run.periodStart.toISOString().slice(0,10)}→${run.periodEnd.toISOString().slice(0,10)} [${run.status}] (${run._count.payslips} payslips) ...`)

  // Reload the variable income entries previously saved for this run
  const priorEntries = await prisma.payrollRunIncomeEntry.findMany({
    where: { payrollRunId: run.id },
    select: { employeeId: true, incomeTypeId: true, amount: true },
  })

  // Also pre-pad any required entries with stored fallback
  const employees = await prisma.employee.findMany({
    where: { companyId: run.companyId, isActive: true },
    select: {
      id: true,
      incomeAssignments: {
        where: { isActive: true, incomeType: { isActive: true, mode: 'VARIABLE' } },
        select: { incomeTypeId: true, fixedAmount: true },
      },
    },
  })
  const required = []
  for (const e of employees) {
    for (const a of e.incomeAssignments) {
      required.push({ employeeId: e.id, incomeTypeId: a.incomeTypeId, fallback: Number(a.fixedAmount ?? 0) })
    }
  }
  const storedMap = new Map(priorEntries.map(e => [`${e.employeeId}:${e.incomeTypeId}`, Number(e.amount)]))
  const variableIncomeEntries = required.map(r => ({
    employeeId: r.employeeId,
    incomeTypeId: r.incomeTypeId,
    amount: storedMap.get(`${r.employeeId}:${r.incomeTypeId}`) ?? r.fallback,
  }))

  const url = `https://onclockph.com/api/payroll/${run.id}/compute?adminKey=${KEY}&companyId=${run.companyId}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variableIncomeEntries }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) {
    console.log(`  ✓ gross=₱${data.totalGross?.toFixed?.(2) ?? '?'}  net=₱${data.totalNetPay?.toFixed?.(2) ?? '?'}`)
  } else {
    console.log(`  ✗ ${res.status} ${data?.error ?? ''}`)
  }
}

await prisma.$disconnect()
console.log('\n✅ Done')
