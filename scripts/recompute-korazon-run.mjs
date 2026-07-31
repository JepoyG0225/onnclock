/**
 * Recompute Korazon's latest (non-LOCKED) payroll run against onclockph.com
 * so the schedule-aware trackTime=false day count is applied.
 *
 * Background: getWorkingDays() hardcoded Mon-Fri, so employees with
 * trackTime=false and a 6/7-day schedule were paid a 5-day week's worth of
 * days (₱7,000 for the Jul 11–25 cutoff instead of their full roster).
 *
 * Uses the admin-key bypass on /api/payroll/[runId]/compute so no session
 * cookie is needed. Same pattern as recompute-corex-run.mjs.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const KEY = '6218ea2d55f33b30b166fde611bf5e13d9bcd72a5f9dd16b'
const BASE = 'https://onclockph.com'

const c = await prisma.company.findFirst({
  where: { name: { contains: 'korazon', mode: 'insensitive' } },
  select: { id: true, name: true },
})
if (!c) { console.log('Korazon not found'); process.exit(0) }

// Latest non-LOCKED run only — locked/approved history stays untouched.
const runs = await prisma.payrollRun.findMany({
  where: { companyId: c.id, status: { not: 'LOCKED' } },
  select: { id: true, periodLabel: true, periodStart: true, periodEnd: true, status: true },
  orderBy: { periodStart: 'desc' },
  take: 1,
})
console.log(`${c.name}: ${runs.length} run(s) to recompute`)

// The compute endpoint rejects the request unless every required
// (employee × VARIABLE income type) pair is submitted, even at 0.
const employees = await prisma.employee.findMany({
  where: { companyId: c.id, isActive: true },
  select: {
    id: true,
    incomeAssignments: {
      where: { isActive: true, incomeType: { isActive: true, mode: 'VARIABLE' } },
      select: { incomeTypeId: true },
    },
  },
})
const requiredPairs = []
for (const emp of employees) {
  for (const a of emp.incomeAssignments) {
    requiredPairs.push({ employeeId: emp.id, incomeTypeId: a.incomeTypeId })
  }
}

for (const r of runs) {
  const priorEntries = await prisma.payrollRunIncomeEntry.findMany({
    where: { payrollRunId: r.id, incomeType: { mode: 'VARIABLE' } },
    select: { employeeId: true, incomeTypeId: true, amount: true },
  })
  const priorByKey = new Map(
    priorEntries.map(e => [`${e.employeeId}:${e.incomeTypeId}`, Number(e.amount)])
  )
  const variableIncomeEntries = requiredPairs.map(p => ({
    employeeId: p.employeeId,
    incomeTypeId: p.incomeTypeId,
    amount: priorByKey.get(`${p.employeeId}:${p.incomeTypeId}`) ?? 0,
  }))

  const url = `${BASE}/api/payroll/${r.id}/compute?adminKey=${KEY}&companyId=${c.id}`
  console.log(`\n→ ${r.periodLabel} (${r.status})  id=${r.id}`)
  console.log(`  Carrying ${variableIncomeEntries.length} variable income entries`)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variableIncomeEntries }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.log(`  ✗ ${res.status}: ${text.slice(0, 300)}`)
    continue
  }
  try {
    const json = JSON.parse(text)
    console.log(`  ✓ employees=${json.employeeCount} gross=₱${json.totalGross} net=₱${json.totalNetPay}`)
  } catch {
    console.log(`  ✓ ${text.slice(0, 200)}`)
  }
}
await prisma.$disconnect()
