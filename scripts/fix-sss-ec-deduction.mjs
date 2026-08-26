/**
 * One-off correction: SSS Employees' Compensation is 100% employer-borne
 * (PD 626), but the payroll engine was folding `sssEc` into the employee's
 * totalDeductions — and therefore out of netPay. The engine is fixed; this
 * repairs payslips already written.
 *
 * Surgical by design: only totalDeductions and netPay move, by exactly the
 * payslip's own stored sssEc. Nothing is recomputed, so DTR / rate / config
 * changes made since a run was locked cannot leak in.
 *
 * Reverse with scripts/backup-sss-ec-payslips.mjs output.
 *   node --env-file=.env.local scripts/fix-sss-ec-deduction.mjs --apply
 * Without --apply it prints the plan and exits.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const slips = await prisma.payslip.findMany({
  where: { sssEc: { gt: 0 } },
  select: { id: true, sssEc: true, totalDeductions: true, netPay: true },
})
console.log(`${slips.length} payslips to correct (apply=${APPLY})`)

let moved = 0, done = 0
for (const s of slips) {
  const ec = Number(s.sssEc)
  const totalDeductions = parseFloat((Number(s.totalDeductions) - ec).toFixed(2))
  const netPay          = parseFloat((Number(s.netPay) + ec).toFixed(2))
  if (totalDeductions < 0) { console.warn(`SKIP ${s.id}: would go negative`); continue }
  moved += ec
  if (APPLY) {
    await prisma.payslip.update({ where: { id: s.id }, data: { totalDeductions, netPay } })
    if (++done % 100 === 0) console.log(`  ${done}/${slips.length}`)
  }
}
console.log(`${APPLY ? 'applied' : 'would move'} ₱${moved.toFixed(2)} from deductions back to net pay`)
await prisma.$disconnect()
