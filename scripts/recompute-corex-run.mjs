/**
 * Recompute COREX's open (non-LOCKED) payroll run(s) against onclockph.com
 * so the new schedule-derived ND fallback is applied. Uses the admin-key
 * bypass on /api/payroll/[runId]/compute so we don't need a session cookie.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const KEY = '6218ea2d55f33b30b166fde611bf5e13d9bcd72a5f9dd16b'
const BASE = 'https://onclockph.com'

const c = await prisma.company.findFirst({
  where: { name: { contains: 'corex', mode: 'insensitive' } },
  select: { id: true, name: true },
})
if (!c) { console.log('COREX not found'); process.exit(0) }

const runs = await prisma.payrollRun.findMany({
  where: { companyId: c.id, status: { not: 'LOCKED' } },
  select: { id: true, periodStart: true, periodEnd: true, status: true },
  orderBy: { periodStart: 'desc' },
})
console.log(`${c.name}: ${runs.length} non-LOCKED runs to recompute`)

// Build the full set of required variable-income entries by joining the
// active employees with their active VARIABLE income assignments, then
// overlay any prior amounts that were saved on this run. The compute
// endpoint rejects the request unless every required (employee × variable
// income type) pair is submitted, even if the amount is 0.
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
  console.log(`\n→ ${r.id} (${r.periodStart.toISOString().slice(0,10)} → ${r.periodEnd.toISOString().slice(0,10)}, ${r.status})`)
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
    console.log(`  ✓ employees=${json.employeeCount} gross=₱${json.totalGross?.toFixed?.(2) ?? json.totalGross} net=₱${json.totalNetPay?.toFixed?.(2) ?? json.totalNetPay}`)
  } catch {
    console.log(`  ✓ ${text.slice(0, 200)}`)
  }
}
await prisma.$disconnect()
