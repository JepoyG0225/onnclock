/**
 * Revert all APPROVED DTRs (and their auto-OT requests) for a company in a
 * date range back to PENDING. Dry-run by default — pass --apply to commit.
 *
 * Usage:
 *   node scripts/revert-approvals.mjs --company "Corex" --month 2026-05
 *   node scripts/revert-approvals.mjs --company "Corex" --from 2026-05-01 --to 2026-05-31 --apply
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => {
    if (!a.startsWith('--')) return null
    const key = a.slice(2)
    const next = arr[i + 1]
    if (next && !next.startsWith('--')) return [key, next]
    return [key, true]
  }).filter(Boolean),
)
const APPLY = !!args.apply
const COMPANY = args.company
const AUTO_OT_PREFIX = '[AUTO_OT]'

if (!COMPANY) { console.error('Usage: --company "Name" --month YYYY-MM  [--apply]'); process.exit(1) }

// Resolve date range
let fromDate, toDate
if (args.month) {
  const [y, m] = args.month.split('-').map(Number)
  fromDate = new Date(Date.UTC(y, m - 1, 1))
  toDate = new Date(Date.UTC(y, m, 0))   // last day of that month
} else if (args.from && args.to) {
  fromDate = new Date(args.from)
  toDate = new Date(args.to)
} else {
  console.error('Provide --month YYYY-MM or --from / --to')
  process.exit(1)
}
const endPlus = new Date(toDate); endPlus.setDate(endPlus.getDate() + 1)
console.log(`Range: ${fromDate.toISOString().slice(0,10)} → ${toDate.toISOString().slice(0,10)} inclusive`)

const company = await prisma.company.findFirst({
  where: { name: { contains: COMPANY, mode: 'insensitive' } },
  select: { id: true, name: true },
})
if (!company) { console.error(`Company "${COMPANY}" not found`); process.exit(1) }
console.log(`Company: ${company.name} (${company.id})\n`)

// === DTRs to revert ===
const approvedDtrs = await prisma.dTRRecord.findMany({
  where: {
    employee: { companyId: company.id },
    date: { gte: fromDate, lt: endPlus },
    approvedBy: { not: null },
  },
  select: {
    id: true, employeeId: true, date: true, approvedBy: true,
    employee: { select: { firstName: true, lastName: true, employeeNo: true } },
  },
  orderBy: [{ date: 'asc' }, { employee: { lastName: 'asc' } }],
})
console.log(`APPROVED DTRs to revert: ${approvedDtrs.length}`)
const byEmpDtr = {}
for (const d of approvedDtrs) {
  const k = `${d.employee.firstName} ${d.employee.lastName}`
  byEmpDtr[k] = (byEmpDtr[k] || 0) + 1
}
for (const [name, n] of Object.entries(byEmpDtr).slice(0, 30)) {
  console.log(`  ${name.padEnd(30)} ${n} record${n !== 1 ? 's' : ''}`)
}

// === Auto-OT requests to revert ===
const approvedOt = await prisma.overtimeRequest.findMany({
  where: {
    companyId: company.id,
    date: { gte: fromDate, lt: endPlus },
    status: 'APPROVED',
    reason: { startsWith: AUTO_OT_PREFIX },
  },
  select: {
    id: true, employeeId: true, date: true, hours: true,
    employee: { select: { firstName: true, lastName: true } },
  },
})
console.log(`\nAPPROVED auto-OT requests to revert: ${approvedOt.length}`)

if (!APPLY) {
  console.log('\n(dry-run — no changes written. Re-run with --apply to commit.)')
  await prisma.$disconnect(); process.exit(0)
}

console.log('\nApplying revert...')
const dtrResult = await prisma.dTRRecord.updateMany({
  where: {
    employee: { companyId: company.id },
    date: { gte: fromDate, lt: endPlus },
    approvedBy: { not: null },
  },
  data: { approvedBy: null },
})
console.log(`  DTRs reverted to PENDING: ${dtrResult.count}`)

const otResult = await prisma.overtimeRequest.updateMany({
  where: {
    companyId: company.id,
    date: { gte: fromDate, lt: endPlus },
    status: 'APPROVED',
    reason: { startsWith: AUTO_OT_PREFIX },
  },
  data: { status: 'PENDING', approvedById: null, approvedAt: null },
})
console.log(`  Auto-OT requests reverted to PENDING: ${otResult.count}`)

console.log('\n✓ Done.')
await prisma.$disconnect()
