/**
 * Project Management DDL for POST /api/admin/run-migrations.
 *
 * EVERY ENTRY MUST BE EXACTLY ONE SQL STATEMENT.
 *
 * Prisma sends `$executeRawUnsafe` over the extended query protocol, which
 * rejects multi-command strings with:
 *
 *   ERROR 42601: cannot insert multiple commands into a prepared statement
 *
 * So a chunk bundling `CREATE TABLE … ; CREATE INDEX … ;` fails outright.
 * This is the same constraint the existing scripts/apply-*-migration.mjs
 * scripts are written around. A `DO $$ … $$` block counts as one statement
 * even though it contains semicolons internally, so those are fine as-is.
 *
 * Everything is idempotent (IF NOT EXISTS / DO-EXCEPTION), so the endpoint is
 * safe to call repeatedly.
 *
 * MIRROR OF prisma/migrations/20260809000000_add_project_management/migration.sql
 * — keep the two in sync. The .sql file is the record for `prisma migrate`;
 * this module is what actually runs, because `prisma migrate deploy` can't
 * reach the database from the Vercel build (P1001).
 */

type StatementGroup = { group: string; statements: string[] }

const GROUPS: StatementGroup[] = [
  {
    group: 'pm_enums',
    statements: [
      `DO $$ BEGIN
         CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         CREATE TYPE "ProjectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         CREATE TYPE "ProjectMemberRole" AS ENUM ('OWNER', 'MANAGER', 'MEMBER', 'VIEWER');
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
  {
    group: 'pm_notification_types',
    statements: [
      `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';`,
      `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_COMMENTED';`,
      `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_DUE_SOON';`,
      `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_MENTIONED';`,
    ],
  },
  {
    group: 'pm_projects',
    statements: [
      `CREATE TABLE IF NOT EXISTS "projects" (
         "id"              TEXT              NOT NULL,
         "companyId"       TEXT              NOT NULL,
         "key"             TEXT              NOT NULL,
         "name"            TEXT              NOT NULL,
         "description"     TEXT,
         "status"          "ProjectStatus"   NOT NULL DEFAULT 'PLANNING',
         "priority"        "ProjectPriority" NOT NULL DEFAULT 'MEDIUM',
         "color"           TEXT              NOT NULL DEFAULT '#2563eb',
         "startDate"       DATE,
         "targetEndDate"   DATE,
         "actualEndDate"   DATE,
         "departmentId"    TEXT,
         "ownerEmployeeId" TEXT,
         "budgetAmount"    DECIMAL(14,2),
         "isArchived"      BOOLEAN           NOT NULL DEFAULT false,
         "taskCounter"     INTEGER           NOT NULL DEFAULT 0,
         "createdByUserId" TEXT,
         "createdAt"       TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt"       TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
       );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "projects_companyId_key_key" ON "projects"("companyId", "key");`,
      `CREATE INDEX IF NOT EXISTS "projects_companyId_status_idx" ON "projects"("companyId", "status");`,
      `CREATE INDEX IF NOT EXISTS "projects_companyId_isArchived_idx" ON "projects"("companyId", "isArchived");`,
      `CREATE INDEX IF NOT EXISTS "projects_companyId_departmentId_idx" ON "projects"("companyId", "departmentId");`,
      `DO $$ BEGIN
         ALTER TABLE "projects" ADD CONSTRAINT "projects_companyId_fkey"
           FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         ALTER TABLE "projects" ADD CONSTRAINT "projects_departmentId_fkey"
           FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerEmployeeId_fkey"
           FOREIGN KEY ("ownerEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
  {
    group: 'pm_project_members',
    statements: [
      `CREATE TABLE IF NOT EXISTS "project_members" (
         "id"         TEXT                NOT NULL,
         "projectId"  TEXT                NOT NULL,
         "employeeId" TEXT                NOT NULL,
         "role"       "ProjectMemberRole" NOT NULL DEFAULT 'MEMBER',
         "createdAt"  TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
       );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "project_members_projectId_employeeId_key" ON "project_members"("projectId", "employeeId");`,
      `CREATE INDEX IF NOT EXISTS "project_members_employeeId_idx" ON "project_members"("employeeId");`,
      `DO $$ BEGIN
         ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey"
           FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         ALTER TABLE "project_members" ADD CONSTRAINT "project_members_employeeId_fkey"
           FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
  {
    // Company-level statuses replaced per-project board columns in v2, so a
    // task can exist without a project and one Kanban can span projects.
    group: 'pm_task_statuses',
    statements: [
      `DO $$ BEGIN
         CREATE TYPE "TaskStatusCategory" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `CREATE TABLE IF NOT EXISTS "task_statuses" (
         "id"        TEXT                 NOT NULL,
         "companyId" TEXT                 NOT NULL,
         "name"      TEXT                 NOT NULL,
         "color"     TEXT                 NOT NULL DEFAULT '#666666',
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
      `DROP TABLE IF EXISTS "project_columns" CASCADE;`,
      `ALTER TABLE "projects" DROP COLUMN IF EXISTS "taskCounter";`,
    ],
  },
  {
    group: 'pm_project_labels',
    statements: [
      `CREATE TABLE IF NOT EXISTS "project_labels" (
         "id"        TEXT NOT NULL,
         "projectId" TEXT NOT NULL,
         "name"      TEXT NOT NULL,
         "color"     TEXT NOT NULL DEFAULT '#6366f1',
         CONSTRAINT "project_labels_pkey" PRIMARY KEY ("id")
       );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "project_labels_projectId_name_key" ON "project_labels"("projectId", "name");`,
      `DO $$ BEGIN
         ALTER TABLE "project_labels" ADD CONSTRAINT "project_labels_projectId_fkey"
           FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
  {
    group: 'pm_tasks',
    statements: [
      `CREATE TABLE IF NOT EXISTS "tasks" (
         "id"              TEXT             NOT NULL,
         "companyId"       TEXT             NOT NULL,
         "projectId"       TEXT,
         "statusId"        TEXT             NOT NULL,
         "parentTaskId"    TEXT,
         "number"          INTEGER          NOT NULL,
         "title"           TEXT             NOT NULL,
         "description"     TEXT,
         "priority"        "TaskPriority"   NOT NULL DEFAULT 'MEDIUM',
         "order"           DOUBLE PRECISION NOT NULL DEFAULT 0,
         "startDate"       DATE,
         "dueDate"         DATE,
         "estimateHours"   DECIMAL(7,2),
         "completedAt"     TIMESTAMP(3),
         "createdByUserId" TEXT,
         "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
       );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "tasks_companyId_number_key" ON "tasks"("companyId", "number");`,
      `CREATE INDEX IF NOT EXISTS "tasks_companyId_dueDate_idx" ON "tasks"("companyId", "dueDate");`,
      `CREATE INDEX IF NOT EXISTS "tasks_companyId_statusId_order_idx" ON "tasks"("companyId", "statusId", "order");`,
      `CREATE INDEX IF NOT EXISTS "tasks_projectId_idx" ON "tasks"("projectId");`,
      `CREATE INDEX IF NOT EXISTS "tasks_parentTaskId_idx" ON "tasks"("parentTaskId");`,
      // A task outlives the project it was filed under — losing the grouping
      // must not delete the work.
      `DO $$ BEGIN
         ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey"
           FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         ALTER TABLE "tasks" ADD CONSTRAINT "tasks_statusId_fkey"
           FOREIGN KEY ("statusId") REFERENCES "task_statuses"("id") ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentTaskId_fkey"
           FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
  {
    group: 'pm_task_assignees',
    statements: [
      `CREATE TABLE IF NOT EXISTS "task_assignees" (
         "id"         TEXT         NOT NULL,
         "taskId"     TEXT         NOT NULL,
         "employeeId" TEXT         NOT NULL,
         "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
       );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "task_assignees_taskId_employeeId_key" ON "task_assignees"("taskId", "employeeId");`,
      `CREATE INDEX IF NOT EXISTS "task_assignees_employeeId_idx" ON "task_assignees"("employeeId");`,
      `DO $$ BEGIN
         ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey"
           FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_employeeId_fkey"
           FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
  {
    group: 'pm_task_labels',
    statements: [
      `CREATE TABLE IF NOT EXISTS "task_labels" (
         "taskId"  TEXT NOT NULL,
         "labelId" TEXT NOT NULL,
         CONSTRAINT "task_labels_pkey" PRIMARY KEY ("taskId", "labelId")
       );`,
      `CREATE INDEX IF NOT EXISTS "task_labels_labelId_idx" ON "task_labels"("labelId");`,
      `DO $$ BEGIN
         ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_taskId_fkey"
           FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_labelId_fkey"
           FOREIGN KEY ("labelId") REFERENCES "project_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
  {
    group: 'pm_task_checklist',
    statements: [
      `CREATE TABLE IF NOT EXISTS "task_checklist_items" (
         "id"        TEXT         NOT NULL,
         "taskId"    TEXT         NOT NULL,
         "text"      TEXT         NOT NULL,
         "isDone"    BOOLEAN      NOT NULL DEFAULT false,
         "order"     INTEGER      NOT NULL DEFAULT 0,
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
       );`,
      `CREATE INDEX IF NOT EXISTS "task_checklist_items_taskId_order_idx" ON "task_checklist_items"("taskId", "order");`,
      `DO $$ BEGIN
         ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_taskId_fkey"
           FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
  {
    group: 'pm_task_comments',
    statements: [
      `CREATE TABLE IF NOT EXISTS "task_comments" (
         "id"        TEXT         NOT NULL,
         "taskId"    TEXT         NOT NULL,
         "userId"    TEXT         NOT NULL,
         "body"      TEXT         NOT NULL,
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
       );`,
      `CREATE INDEX IF NOT EXISTS "task_comments_taskId_createdAt_idx" ON "task_comments"("taskId", "createdAt");`,
      `DO $$ BEGIN
         ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fkey"
           FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `ALTER TABLE "task_comments" ADD COLUMN IF NOT EXISTS "mentions" TEXT[] NOT NULL DEFAULT '{}';`,
    ],
  },
  {
    group: 'pm_task_activity',
    statements: [
      `CREATE TABLE IF NOT EXISTS "task_activity" (
         "id"        TEXT         NOT NULL,
         "taskId"    TEXT         NOT NULL,
         "userId"    TEXT,
         "action"    TEXT         NOT NULL,
         "meta"      JSONB,
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "task_activity_pkey" PRIMARY KEY ("id")
       );`,
      `CREATE INDEX IF NOT EXISTS "task_activity_taskId_createdAt_idx" ON "task_activity"("taskId", "createdAt");`,
      `DO $$ BEGIN
         ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_taskId_fkey"
           FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
  {
    group: 'pm_task_attachments',
    statements: [
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
      `CREATE INDEX IF NOT EXISTS "task_attachments_taskId_createdAt_idx" ON "task_attachments"("taskId", "createdAt");`,
      `DO $$ BEGIN
         ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_taskId_fkey"
           FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
  {
    group: 'pm_task_time_logs',
    statements: [
      `CREATE TABLE IF NOT EXISTS "task_time_logs" (
         "id"              TEXT         NOT NULL,
         "taskId"          TEXT         NOT NULL,
         "employeeId"      TEXT         NOT NULL,
         "date"            DATE         NOT NULL,
         "hours"           DECIMAL(6,2) NOT NULL,
         "note"            TEXT,
         "billable"        BOOLEAN      NOT NULL DEFAULT true,
         "createdByUserId" TEXT,
         "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "task_time_logs_pkey" PRIMARY KEY ("id")
       );`,
      `CREATE INDEX IF NOT EXISTS "task_time_logs_taskId_idx" ON "task_time_logs"("taskId");`,
      `CREATE INDEX IF NOT EXISTS "task_time_logs_employeeId_date_idx" ON "task_time_logs"("employeeId", "date");`,
      `DO $$ BEGIN
         ALTER TABLE "task_time_logs" ADD CONSTRAINT "task_time_logs_taskId_fkey"
           FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         ALTER TABLE "task_time_logs" ADD CONSTRAINT "task_time_logs_employeeId_fkey"
           FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
  {
    // Guided-tour progress, stored per USER rather than per browser.
    group: 'pm_tour_state',
    statements: [
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tourState" JSONB;`,
    ],
  },
  {
    group: 'pm_task_dependencies',
    statements: [
      `CREATE TABLE IF NOT EXISTS "task_dependencies" (
         "id"              TEXT         NOT NULL,
         "taskId"          TEXT         NOT NULL,
         "dependsOnTaskId" TEXT         NOT NULL,
         "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
       );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "task_dependencies_taskId_dependsOnTaskId_key" ON "task_dependencies"("taskId", "dependsOnTaskId");`,
      `CREATE INDEX IF NOT EXISTS "task_dependencies_dependsOnTaskId_idx" ON "task_dependencies"("dependsOnTaskId");`,
      `DO $$ BEGIN
         ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_taskId_fkey"
           FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      `DO $$ BEGIN
         ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependsOnTaskId_fkey"
           FOREIGN KEY ("dependsOnTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    ],
  },
]

/** Flat, single-statement list consumed by /api/admin/run-migrations. */
export const PROJECT_MANAGEMENT_MIGRATIONS: Array<{ name: string; sql: string }> =
  GROUPS.flatMap(g =>
    g.statements.map((sql, i) => ({
      name: `${g.group}_${String(i + 1).padStart(2, '0')}`,
      sql,
    })),
  )
