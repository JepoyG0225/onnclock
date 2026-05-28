/**
 * Fix: Loyola has enableOvertime=false but APPROVED OT requests still exist.
 *
 * This script:
 *   1. Verifies Loyola's payroll config has enableOvertime = false
 *   2. Lists all APPROVED OT requests for Loyola
 *   3. With --apply: cancels (sets to REJECTED) those APPROVED OT requests
 *      so the next payroll recompute will produce $0 OT
 *
 * Usage (dry run):
 *   node scripts/fix-loyola-ot-disabled.mjs
 * Apply:
 *   node scripts/fix-loyola-ot-disabled.mjs --apply
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// ─── 1. Find Loyola ──────────────────────────────────────────────────────────
const candidates = await prisma.company.findMany({
  where: { name: { contains: 'Loyola', mode: 'insensitive' } },
  select: { id: true, name: true },
})
if (candidates.length === 0) { console.error('No company matching "Loyola"'); process.exit(1) }
if (candidates.length > 1) {
  console.log('Multiple matches — pick one:')
  for (const c of candidates) console.log(`  ${c.id}  ${c.name}`)
  process.exit(1)
}
const company = candidates[0]
console.log(`\nCompany: ${company.name}  (${company.id})\n`)

// ─── 2. Check payroll config ─────────────────────────────────────────────────
const config = await prisma.payrollCycleConfig.findUnique({
  where: { companyId: company.id },
  select: { enableOvertime: true },
})
if (!config) {
  console.log('⚠  No PayrollCycleConfig row found — overtime defaults to ENABLED.')
  console.log('   Go to Payroll Settings and save the config first, then re-run this script.')
  await prisma.$disconnect(); process.exit(0)
}
console.log(`enableOvertime in DB: ${config.enableOvertime}`)
if (config.enableOvertime) {
  console.log('✅ Overtime is ENABLED — nothing to fix. Disable it in Payroll Settings first.')
  await prisma.$disconnect(); process.exit(0)
}
console.log('✅ Overtime is correctly DISABLED in payroll settings.\n')

// ─── 3. Find APPROVED OT requests ───────────────────────────────────────────
const approved = await prisma.overtimeRequest.findMany({
  where: { companyId: company.id, status: 'APPROVED' },
  select: {
    id: true, date: true, hours: true, status: true, reason: true,
    employee: { select: { firstName: true, lastName: true, employeeNo: true } },
  },
  orderBy: { date: 'desc' },
})

console.log(`APPROVED OT requests: ${approved.length}`)
for (const r of approved) {
  const name = `${r.employee.firstName} ${r.employee.lastName}`.padEnd(28)
  const date = r.date.toISOString().slice(0, 10)
  const auto = r.reason?.startsWith('[AUTO_OT]') ? ' [auto]' : ''
  console.log(`  ${name}  ${date}  ${r.hours}h${auto}`)
}

if (approved.length === 0) {
  console.log('\n✅ No approved OT requests — payroll should compute $0 OT already.')
  console.log('   If OT still shows up, try recomputing the payroll run.')
  await prisma.$disconnect(); process.exit(0)
}

// ─── 4. Apply or dry-run ─────────────────────────────────────────────────────
if (!APPLY) {
  console.log(`\n[DRY RUN] Would cancel ${approved.length} APPROVED OT requests.`)
  console.log('Re-run with --apply to actually cancel them.')
} else {
  const ids = approved.map(r => r.id)
  const result = await prisma.overtimeRequest.updateMany({
    where: { id: { in: ids } },
    data: {
      status: 'REJECTED',
      rejectionReason: 'Auto-cancelled: overtime pay is disabled in payroll settings.',
    },
  })
  console.log(`\n✅ Cancelled ${result.count} OT request(s).`)
  console.log('   Now recompute the affected payroll run(s) to remove the OT amounts.')
}

await prisma.$disconnect()
