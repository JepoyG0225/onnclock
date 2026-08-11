/**
 * Task Management v3: remove Projects entirely.
 *
 *  • drop tasks.projectId, projects, project_members
 *  • per-project labels become company-level (task_labels_catalog)
 *  • task_labels becomes a pure join onto the company label catalog
 *
 * Refuses to run if any tasks exist, since dropping projectId would silently
 * discard how existing work was grouped.
 *
 * ONE STATEMENT PER ENTRY — Prisma's extended query protocol rejects
 * multi-command strings (42601).
 *
 * Run with:  node scripts/apply-remove-projects-migration.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const counts = await prisma.$queryRawUnsafe(`
  SELECT (SELECT COUNT(*)::int FROM tasks) AS tasks,
         (SELECT COUNT(*)::int FROM projects) AS projects`).catch(() => [{ tasks: 0, projects: 0 }])
console.log(`existing rows → tasks: ${counts[0].tasks}, projects: ${counts[0].projects}`)

if (counts[0].tasks > 0) {
  console.error(`REFUSING TO RUN: ${counts[0].tasks} task(s) exist and would lose their grouping.`)
  await prisma.$disconnect()
  process.exit(1)
}

const statements = [
  // Company-level label catalog.
  `CREATE TABLE IF NOT EXISTS "task_labels_catalog" (
     "id"        TEXT         NOT NULL,
     "companyId" TEXT         NOT NULL,
     "name"      TEXT         NOT NULL,
     "color"     TEXT         NOT NULL DEFAULT '#6366f1',
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "task_labels_catalog_pkey" PRIMARY KEY ("id")
   );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "task_labels_catalog_companyId_name_key"
     ON "task_labels_catalog"("companyId", "name");`,
  `DO $$ BEGIN
     ALTER TABLE "task_labels_catalog" ADD CONSTRAINT "task_labels_catalog_companyId_fkey"
       FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // Re-point the join table at the catalog.
  `DELETE FROM "task_labels";`,
  `ALTER TABLE "task_labels" DROP CONSTRAINT IF EXISTS "task_labels_labelId_fkey";`,
  `DO $$ BEGIN
     ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_labelId_fkey"
       FOREIGN KEY ("labelId") REFERENCES "task_labels_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // Tasks lose their project.
  `ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_projectId_fkey";`,
  `DROP INDEX IF EXISTS "tasks_projectId_idx";`,
  `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "projectId";`,

  // Goodbye, projects.
  `DROP TABLE IF EXISTS "project_labels" CASCADE;`,
  `DROP TABLE IF EXISTS "project_members" CASCADE;`,
  `DROP TABLE IF EXISTS "project_columns" CASCADE;`,
  `DROP TABLE IF EXISTS "projects" CASCADE;`,
  `DROP TYPE IF EXISTS "ProjectStatus";`,
  `DROP TYPE IF EXISTS "ProjectPriority";`,
  `DROP TYPE IF EXISTS "ProjectMemberRole";`,
]

for (let i = 0; i < statements.length; i++) {
  try {
    await prisma.$executeRawUnsafe(statements[i])
    console.log(`  ok  ${i + 1}/${statements.length}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/does not exist|already exists|duplicate_object/i.test(msg)) {
      console.log(`  ↳   ${i + 1} no-op`)
    } else {
      console.error(`  ✗   ${i + 1} failed:`, msg.split('\n')[0])
      process.exitCode = 1
    }
  }
}

const verify = await prisma.$queryRawUnsafe(`
  SELECT
    (SELECT COUNT(*)::int FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN ('projects','project_members','project_labels','project_columns')) AS project_tables_left,
    (SELECT COUNT(*)::int FROM information_schema.tables
      WHERE table_schema='public' AND table_name='task_labels_catalog') AS label_catalog,
    (SELECT COUNT(*)::int FROM information_schema.columns
      WHERE table_name='tasks' AND column_name='projectId') AS tasks_projectid_left,
    (SELECT COUNT(*)::int FROM information_schema.tables
      WHERE table_schema='public' AND table_name='task_statuses') AS statuses`)
console.log('verify →', JSON.stringify(verify[0]))

await prisma.$disconnect()
