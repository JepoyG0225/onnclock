// READ-ONLY. Measures how many payslips carry the employer-borne SSS EC
// inside totalDeductions / netPay. Writes nothing.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const slips = await prisma.payslip.findMany({
  where: { sssEc: { gt: 0 } },
  select: {
    id: true, sssEc: true, netPay: true, totalDeductions: true,
    payrollRun: { select: { id: true, status: true, payDate: true, companyId: true } },
  },
})

console.log('payslips with sssEc > 0:', slips.length)
if (!slips.length) { await prisma.$disconnect(); process.exit(0) }

const byStatus = {}
let total = 0
for (const s of slips) {
  const ec = Number(s.sssEc); total += ec
  const st = s.payrollRun.status
  byStatus[st] ??= { slips: 0, ec: 0, runs: new Set() }
  byStatus[st].slips++; byStatus[st].ec += ec
  byStatus[st].runs.add(s.payrollRun.id)
}
console.log('\nby run status:')
for (const [st, v] of Object.entries(byStatus)) {
  console.log(`  ${st.padEnd(10)} runs=${String(v.runs.size).padStart(4)}  payslips=${String(v.slips).padStart(5)}  EC total=₱${v.ec.toFixed(2)}`)
}
console.log(`\ntotal EC wrongly deducted: ₱${total.toFixed(2)}`)

const ecAmounts = {}
for (const s of slips) { const k = Number(s.sssEc).toFixed(2); ecAmounts[k] = (ecAmounts[k] ?? 0) + 1 }
console.log('\nEC amount distribution (per payslip):')
for (const [amt, n] of Object.entries(ecAmounts).sort((a,b)=>Number(a[0])-Number(b[0]))) {
  console.log(`  ₱${amt.padStart(7)} x ${n}`)
}

const years = {}
for (const s of slips) {
  const y = s.payrollRun.payDate?.getFullYear() ?? 'unknown'
  years[y] = (years[y] ?? 0) + 1
}
console.log('\nby pay year:', years)
console.log('\ncompanies affected:', new Set(slips.map(s => s.payrollRun.companyId)).size)
await prisma.$disconnect()
