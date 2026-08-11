/**
 * Task Management v2: company-level statuses, project-optional tasks.
 *
 *  • new enum TaskStatusCategory + table task_statuses
 *  • companies.taskCounter (task numbers become company-unique)
 *  • tasks.statusId replaces tasks.columnId
 *  • tasks.projectId becomes nullable
 *  • project_columns and projects.taskCounter dropped
 *
 * Safe to run because the module has no data yet — the script REFUSES to run
 * if any tasks exist, rather than silently destroying work.
 *
 * ONE STATEMENT PER ENTRY (Prisma's extended query protocol rejects
 * multi-command strings — see src/lib/migrations/project-management.ts).
 *
 * Run with:  node scripts/apply-task-statuses-migration.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Safety check ──────────────────────────────────────────────────────────
const existing = await prisma.$queryRawUnsafe(`
  SELECT (SELECT COUNT(*)::int FROM tasks)    AS tasks,
         (SELECT COUNT(*)::int FROM projects) AS projects`)
const { tasks, projects } = existing[0]
console.log(`existing rows → tasks: ${tasks}, projects: ${projects}`)

if (tasks > 0) {
  console.error(
    `REFUSING TO RUN: ${tasks} task(s) exist. This migration drops tasks.columnId ` +
    `and project_columns, which would lose their board position. Write a data ` +
    `migration that maps each column to a status first.`,
  )
  await prisma.$disconnect()
  process.exit(1)
}

const statements = [
  `DO $$ BEGIN
     CREATE TYPE "TaskStatusCategory" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  `CREATE TABLE IF NOT EXISTS "task_statuses" (
     "id"        TEXT                 NOT NULL,
     "companyId" TEXT                 NOT NULL,
     "name"      TEXT                 NOT NULL,
     "color"     TEXT                 NOT NULL DEFAULT '#64748b',
     "order"     INTEGER              NOT NULL DEFAULT 0,
     "category"  "TaskStatusCategory" NOT NULL DEFAULT 'TODO',
     "isDefault" BOOLEAN              NOT NULL DEFAULT false,
     "wipLimit"  INTEGER,
     "createdAt" TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "task_statuses_pkey" PRIMARY KEY ("id")
   );`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "task_statuses_companyId_name_key" ON "task_statuses"("companyId", "name");`,
  `CREATE INDEX IF NOT EXISTS "task_statuses_companyId_order_idx" ON "task_statuses"("companyId", "order");`,

  `DO $$ BEGIN
     ALTER TABLE "task_statuses" ADD CONSTRAINT "task_statuses_companyId_fkey"
       FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "taskCounter" INTEGER NOT NULL DEFAULT 0;`,

  // Tasks: swap columnId → statusId, relax projectId.
  `DELETE FROM "tasks";`,
  `ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_columnId_fkey";`,
  `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "columnId";`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "statusId" TEXT;`,
  `ALTER TABLE "tasks" ALTER COLUMN "projectId" DROP NOT NULL;`,

  // projectId now SET NULL on project delete (tasks outlive their grouping).
  `ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_projectId_fkey";`,
  `DO $$ BEGIN
     ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey"
       FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  `DO $$ BEGIN
     ALTER TABLE "tasks" ADD CONSTRAINT "tasks_statusId_fkey"
       FOREIGN KEY ("statusId") REFERENCES "task_statuses"("id") ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // Numbering moves from per-project to per-company.
  `DROP INDEX IF EXISTS "tasks_projectId_number_key";`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "tasks_companyId_number_key" ON "tasks"("companyId", "number");`,
  `DROP INDEX IF EXISTS "tasks_projectId_columnId_order_idx";`,
  `CREATE INDEX IF NOT EXISTS "tasks_companyId_statusId_order_idx" ON "tasks"("companyId", "statusId", "order");`,
  `CREATE INDEX IF NOT EXISTS "tasks_projectId_idx" ON "tasks"("projectId");`,

  // Old board machinery.
  `DROP TABLE IF EXISTS "project_columns" CASCADE;`,
  `ALTER TABLE "projects" DROP COLUMN IF EXISTS "taskCounter";`,
]

for (let i = 0; i < statements.length; i++) {
  try {
    await prisma.$executeRawUnsafe(statements[i])
    console.log(`  ok  ${i + 1}/${statements.length}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/already exists|duplicate_object|does not exist/i.test(msg)) {
      console.log(`  ↳   ${i + 1} no-op — ${msg.split('\n')[0].slice(0, 90)}`)
    } else {
      console.error(`  ✗   ${i + 1} failed:`, msg)
      process.exitCode = 1
    }
  }
}

// statusId must end up NOT NULL, but only after the column exists and is empty.
try {
  await prisma.$executeRawUnsafe(`ALTER TABLE "tasks" ALTER COLUMN "statusId" SET NOT NULL;`)
  console.log('  ok  statusId set NOT NULL')
} catch (err) {
  console.error('  ✗   could not set statusId NOT NULL:', String(err).split('\n')[0])
  process.exitCode = 1
}

const verify = await prisma.$queryRawUnsafe(`
  SELECT
    (SELECT COUNT(*)::int FROM information_schema.tables
      WHERE table_schema='public' AND table_name='task_statuses')  AS statuses_table,
    (SELECT COUNT(*)::int FROM information_schema.tables
      WHERE table_schema='public' AND table_name='project_columns') AS old_columns_table,
    (SELECT is_nullable FROM information_schema.columns
      WHERE table_name='tasks' AND column_name='projectId')         AS projectid_nullable,
    (SELECT is_nullable FROM information_schema.columns
      WHERE table_name='tasks' AND column_name='statusId')          AS statusid_nullable,
    (SELECT COUNT(*)::int FROM information_schema.columns
      WHERE table_name='companies' AND column_name='taskCounter')   AS company_counter`)
console.log('verify →', JSON.stringify(verify[0]))

await prisma.$disconnect()
