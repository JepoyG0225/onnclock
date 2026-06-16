import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
// Latest Corex run (2026-04-26 → 2026-05-10)
const RUN_ID = 'cmp5xou1a0001bla0gocbg6x2'
const COMPANY_ID = 'cmnrr36ih0002z07gw1hq6kjj'

// Get all required variable income assignments
const employees = await p.employee.findMany({
  where: { companyId: COMPANY_ID, isActive: true },
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

// Load existing entries
const stored = await p.payrollRunIncomeEntry.findMany({
  where: { payrollRunId: RUN_ID },
  select: { employeeId: true, incomeTypeId: true, amount: true },
})
const storedMap = new Map(stored.map(e => [`${e.employeeId}:${e.incomeTypeId}`, Number(e.amount)]))

// Build full payload — stored amount where available, fallback (or 0) otherwise
const variableIncomeEntries = required.map(r => ({
  employeeId: r.employeeId,
  incomeTypeId: r.incomeTypeId,
  amount: storedMap.get(`${r.employeeId}:${r.incomeTypeId}`) ?? r.fallback,
}))

console.log(`Required: ${required.length}, Stored: ${stored.length}, Padding ${required.length - stored.length} entries with stored fallback`)

const KEY = '6218ea2d55f33b30b166fde611bf5e13d9bcd72a5f9dd16b'
const url = `https://onclockph.com/api/payroll/${RUN_ID}/compute?adminKey=${KEY}&companyId=${COMPANY_ID}`

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ variableIncomeEntries }),
})
const text = await res.text()
console.log('HTTP', res.status)
console.log(text.slice(0, 3000))
await p.$disconnect()
