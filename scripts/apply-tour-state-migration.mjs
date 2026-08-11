/**
 * Adds users.tourState — server-side guided-tour progress.
 *
 * Tour completion previously lived only in localStorage, which is per-browser:
 * the same user saw every tour again on a second device or after clearing site
 * data. This column makes "show once per user" actually true.
 *
 * Idempotent. ONE STATEMENT PER ENTRY (Prisma's extended query protocol
 * rejects multi-command strings — see src/lib/migrations/project-management.ts).
 *
 *   node scripts/apply-tour-state-migration.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const statements = [
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tourState" JSONB;`,
]

for (let i = 0; i < statements.length; i++) {
  try {
    await prisma.$executeRawUnsafe(statements[i])
    console.log(`  ok  ${i + 1}/${statements.length}`)
  } catch (err) {
    console.error(`  fail ${i + 1}:`, err instanceof Error ? err.message.split('\n')[0] : String(err))
    process.exitCode = 1
  }
}

const check = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS present FROM information_schema.columns
  WHERE table_name = 'users' AND column_name = 'tourState'`)
console.log('verify -> tourState column present:', check[0].present)

await prisma.$disconnect()
