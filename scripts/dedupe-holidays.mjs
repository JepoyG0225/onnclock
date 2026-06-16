/**
 * Dedupe holiday rows where the same (companyId, date) appears more than
 * once. Keep the oldest row per group and delete the rest. Also enforces
 * a unique index so this can never re-occur.
 *
 * Root cause: the holiday-sync code calls `upsertAutoSyncedHolidays`
 * separately for Google Calendar and the public PH holiday API, each
 * tagged differently. Each pass deletes only its OWN tagged rows and
 * treats the OTHER source's rows as "manual", so running both creates
 * one duplicate per holiday per year.
 *
 *   node scripts/dedupe-holidays.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 1. Find every (companyId, date) with > 1 row, keep the OLDEST createdAt
const dupGroups = await prisma.$queryRaw`
  SELECT "companyId", "date", COUNT(*)::int AS cnt
  FROM holidays
  GROUP BY "companyId", "date"
  HAVING COUNT(*) > 1
`
console.log(`Found ${dupGroups.length} duplicate groups`)

let totalDeleted = 0
for (const g of dupGroups) {
  const rows = await prisma.holiday.findMany({
    where: { companyId: g.companyId, date: g.date },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, createdAt: true, description: true },
  })
  if (rows.length < 2) continue
  // Keep the FIRST one (oldest), prefer one without a sync tag if mixed
  // — manually-added holidays should win over auto-synced.
  const manual = rows.find(r => !r.description || (!r.description.startsWith('[auto-sync:') && !r.description.startsWith('public_holiday_api') && !r.description.startsWith('google_calendar')))
  const keep = manual ?? rows[0]
  const toDelete = rows.filter(r => r.id !== keep.id).map(r => r.id)

  await prisma.holiday.deleteMany({ where: { id: { in: toDelete } } })
  totalDeleted += toDelete.length
}
console.log(`Deleted ${totalDeleted} duplicate rows`)

// 2. Add unique index so this can never happen again
try {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "holidays_companyId_date_unique"
    ON "holidays" ("companyId", "date");
  `)
  console.log('✓ Unique index (companyId, date) ensured')
} catch (e) {
  console.error('Failed to add unique index:', e instanceof Error ? e.message : e)
}

// 3. Verify
const stillDup = await prisma.$queryRaw`
  SELECT COUNT(*)::int AS dups
  FROM (
    SELECT "companyId", "date"
    FROM holidays
    GROUP BY "companyId", "date"
    HAVING COUNT(*) > 1
  ) t
`
console.log(`Remaining duplicate groups: ${stillDup[0].dups}`)

await prisma.$disconnect()
