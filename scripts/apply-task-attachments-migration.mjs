/**
 * Applies the second Project Management wave: task attachments + comment
 * @mentions. Idempotent — safe to re-run.
 *
 * Mirrors chunks pm_07/pm_08 in src/lib/migrations/project-management.ts,
 * which is what POST /api/admin/run-migrations executes in a deployed
 * environment. This script is the local equivalent.
 *
 * Run with:  node scripts/apply-task-attachments-migration.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ONE STATEMENT PER ENTRY. Prisma's $executeRawUnsafe uses the extended query
// protocol, which rejects multi-command strings with
// "42601: cannot insert multiple commands into a prepared statement".
// A DO $$ … $$ block counts as a single statement despite its inner semicolons.
const statements = [
  `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_MENTIONED';`,

  `CREATE TABLE IF NOT EXISTS "task_attachments" (
     "id"               TEXT         NOT NULL,
     "taskId"           TEXT         NOT NULL,
     "fileName"         TEXT         NOT NULL,
     "fileUrl"          TEXT         NOT NULL,
     "fileSize"         INTEGER      NOT NULL,
     "mimeType"         TEXT         NOT NULL,
     "uploadedByUserId" TEXT         NOT NULL,
     "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
   );`,

  `CREATE INDEX IF NOT EXISTS "task_attachments_taskId_createdAt_idx"
     ON "task_attachments"("taskId", "createdAt");`,

  `DO $$ BEGIN
     ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_taskId_fkey"
       FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  `ALTER TABLE "task_comments" ADD COLUMN IF NOT EXISTS "mentions" TEXT[] NOT NULL DEFAULT '{}';`,
]

for (let i = 0; i < statements.length; i++) {
  try {
    await prisma.$executeRawUnsafe(statements[i])
    console.log(`  ok  statement ${i + 1}/${statements.length}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/already exists/i.test(msg) || /duplicate_object/i.test(msg)) {
      console.log(`  ↳   statement ${i + 1} already applied — skipping`)
    } else {
      console.error(`  ✗   statement ${i + 1} failed:`, msg)
      process.exitCode = 1
    }
  }
}

const check = await prisma.$queryRawUnsafe(`
  SELECT
    (SELECT COUNT(*)::int FROM information_schema.tables
      WHERE table_schema='public' AND table_name='task_attachments') AS attachments_table,
    (SELECT COUNT(*)::int FROM information_schema.columns
      WHERE table_name='task_comments' AND column_name='mentions') AS mentions_column`)
console.log('verify →', JSON.stringify(check[0]))

await prisma.$disconnect()
