/**
 * One-off: re-derive regularHours / overtimeHours / nightDiffHours / late /
 * undertime on EVERY DTR across EVERY company in the last 365 days, using
 * the current timesheet engine. Run this after the
 * "assume-break-when-unclocked" engine fix lands so any existing MANUAL
 * DTRs that were silently over-credited by 1 hour drop back down to the
 * correct value.
 *
 *   npx tsx scripts/backfill-dtr-hours-all-companies.mts
 *
 * Idempotent — only writes rows where the derived value drifts from
 * what's stored. Companies with no MANUAL DTRs are no-ops.
 */
import { PrismaClient } from '@prisma/client'
import { recomputeCompanyDtrHours } from '../src/lib/timesheet/recompute'

const prisma = new PrismaClient()

const companies = await prisma.company.findMany({
  select: { id: true, name: true },
  orderBy: { name: 'asc' },
})
console.log(`Recomputing DTR hours for ${companies.length} companies (last 365 days)…\n`)

let totalProcessed = 0
let totalUpdated = 0
for (const c of companies) {
  try {
    const r = await recomputeCompanyDtrHours(c.id, { daysBack: 365 })
    if (r.updated > 0) {
      console.log(`  ${c.name.padEnd(40)} ${r.updated}/${r.processed} updated  (${r.windowStart} → ${r.windowEnd})`)
    }
    totalProcessed += r.processed
    totalUpdated += r.updated
  } catch (e) {
    console.error(`  ${c.name}: FAILED — ${e instanceof Error ? e.message : e}`)
  }
}

console.log(`\nDone. ${totalUpdated} DTR rows updated of ${totalProcessed} scanned.`)
await prisma.$disconnect()
