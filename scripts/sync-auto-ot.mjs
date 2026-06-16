/**
 * Re-sync auto-generated OT requests to match current DTR overtimeHours.
 * Use after running recompute-dtr-hours.mjs to remove orphaned PENDING
 * auto-OT requests whose DTR no longer has OT.
 *
 * Usage:
 *   node scripts/sync-auto-ot.mjs --company "Loyola" --days 30 [--apply]
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
const DAYS = parseInt(args.days || '30', 10)
const AUTO_OT_PREFIX = '[AUTO_OT]'

if (!COMPANY) { console.error('Usage: --company "Loyola" [--days N] [--apply]'); process.exit(1) }

const company = await prisma.company.findFirst({
  where: { name: { contains: COMPANY, mode: 'insensitive' } },
  select: { id: true, name: true },
})
if (!company) { console.error(`No company matching "${COMPANY}"`); process.exit(1) }
console.log(`\n=== ${company.name}  (${company.id}) ===\n`)

const since = new Date(); since.setDate(since.getDate() - DAYS)

// 1) Get all PENDING auto-OT requests in range
const pendingAutoOt = await prisma.overtimeRequest.findMany({
  where: {
    companyId: company.id,
    status: 'PENDING',
    date: { gte: since },
    reason: { startsWith: AUTO_OT_PREFIX },
  },
  select: { id: true, employeeId: true, date: true, hours: true,
    employee: { select: { firstName: true, lastName: true } } },
})
console.log(`Pending auto-OT requests in range: ${pendingAutoOt.length}\n`)

// 2) For each, compare against actual DTR overtimeHours for that (emp, date)
const toDelete = []
const toUpdate = []
for (const req of pendingAutoOt) {
  const dayStart = new Date(req.date); dayStart.setHours(0,0,0,0)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
  const dtrs = await prisma.dTRRecord.findMany({
    where: { employeeId: req.employeeId, date: { gte: dayStart, lt: dayEnd } },
    select: { overtimeHours: true },
  })
  const totalOt = dtrs.reduce((s, d) => s + Number(d.overtimeHours ?? 0), 0)
  const roundedOt = Math.round(Math.max(0, totalOt) * 100) / 100
  const reqHours = Number(req.hours ?? 0)
  if (roundedOt < 0.01) {
    toDelete.push({ ...req, totalOt: roundedOt })
  } else if (Math.abs(reqHours - roundedOt) >= 0.01) {
    toUpdate.push({ ...req, totalOt: roundedOt, oldHours: reqHours })
  }
}

const fmt = (d) => d.date.toISOString().slice(0,10)
const name = (r) => `${r.employee?.firstName ?? ''} ${r.employee?.lastName ?? ''}`.trim()

console.log(`Stale (DTR has 0 OT) → DELETE: ${toDelete.length}`)
for (const r of toDelete) console.log(`  ${name(r).padEnd(28)} ${fmt(r)}  was hours=${r.hours}`)

console.log(`\nMismatched hours → UPDATE: ${toUpdate.length}`)
for (const r of toUpdate) console.log(`  ${name(r).padEnd(28)} ${fmt(r)}  old=${r.oldHours} → new=${r.totalOt}`)

if (!APPLY) {
  console.log(`\n(dry-run — no changes. Re-run with --apply to commit.)`)
  await prisma.$disconnect(); process.exit(0)
}

let deleted = 0, updated = 0
for (const r of toDelete) { await prisma.overtimeRequest.delete({ where: { id: r.id } }); deleted++ }
for (const r of toUpdate) { await prisma.overtimeRequest.update({ where: { id: r.id }, data: { hours: r.totalOt } }); updated++ }
console.log(`\n✓ Deleted ${deleted}  Updated ${updated}`)

await prisma.$disconnect()
