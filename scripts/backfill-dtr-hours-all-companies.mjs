/**
 * One-off: re-derive regularHours / overtimeHours / nightDiffHours / late /
 * undertime on EVERY DTR across EVERY company in the last 365 days, using
 * the deployed timesheet engine via /api/admin/recompute-dtr-hours.
 *
 *   node scripts/backfill-dtr-hours-all-companies.mjs
 *
 * Idempotent — the endpoint only writes rows where the derived value
 * drifts from what's stored.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const KEY = '6218ea2d55f33b30b166fde611bf5e13d9bcd72a5f9dd16b'
const BASE = 'https://onclockph.com'

const companies = await prisma.company.findMany({
  select: { id: true, name: true },
  orderBy: { name: 'asc' },
})
console.log(`Recomputing DTR hours for ${companies.length} companies (last 365 days)…\n`)

let totalUpdated = 0
let totalProcessed = 0
for (const c of companies) {
  const url = `${BASE}/api/admin/recompute-dtr-hours?adminKey=${KEY}&companyId=${c.id}&daysBack=365`
  try {
    const res = await fetch(url, { method: 'POST' })
    const text = await res.text()
    if (!res.ok) {
      console.error(`  ${c.name}: ${res.status} — ${text.slice(0, 200)}`)
      continue
    }
    const json = JSON.parse(text)
    if (json.updated > 0) {
      console.log(`  ${c.name.padEnd(40)} ${json.updated}/${json.processed} updated  (${json.windowStart} → ${json.windowEnd})`)
    }
    totalUpdated += json.updated ?? 0
    totalProcessed += json.processed ?? 0
  } catch (e) {
    console.error(`  ${c.name}: FAILED — ${e instanceof Error ? e.message : e}`)
  }
}

console.log(`\nDone. ${totalUpdated} DTR rows updated of ${totalProcessed} scanned.`)
await prisma.$disconnect()
