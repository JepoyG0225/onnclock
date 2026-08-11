-- Project Management: boards, tasks, time logs.
--
-- Written idempotently (IF NOT EXISTS / DO-EXCEPTION guards) because in this
-- project migrations are applied at runtime through the SUPER_ADMIN endpoint
-- POST /api/admin/run-migrations, which may be invoked more than once. The
-- same SQL is registered there under `create_project_management`.

-- ── Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectMemberRole" AS ENUM ('OWNER', 'MANAGER', 'MEMBER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Task notification types, appended to the existing NotificationType enum.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_COMMENTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_DUE_SOON';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_MENTIONED';

-- ── projects ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "projects" (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS "projects_companyId_key_key"     ON "projects"("companyId", "key");
CREATE INDEX        IF NOT EXISTS "projects_companyId_status_idx"  ON "projects"("companyId", "status");
CREATE INDEX        IF NOT EXISTS "projects_companyId_isArchived_idx" ON "projects"("companyId", "isArchived");
CREATE INDEX        IF NOT EXISTS "projects_companyId_departmentId_idx" ON "projects"("companyId", "departmentId");

DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerEmployeeId_fkey"
    FOREIGN KEY ("ownerEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── project_members ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "project_members" (
  "id"         TEXT                NOT NULL,
  "projectId"  TEXT                NOT NULL,
  "employeeId" TEXT                NOT NULL,
  "role"       "ProjectMemberRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt"  TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_members_projectId_employeeId_key" ON "project_members"("projectId", "employeeId");
CREATE INDEX        IF NOT EXISTS "project_members_employeeId_idx"           ON "project_members"("employeeId");

DO $$ BEGIN
  ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "project_members" ADD CONSTRAINT "project_members_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── project_columns ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "project_columns" (
  "id"        TEXT         NOT NULL,
  "projectId" TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "color"     TEXT         NOT NULL DEFAULT '#64748b',
  "order"     INTEGER      NOT NULL DEFAULT 0,
  "isDone"    BOOLEAN      NOT NULL DEFAULT false,
  "wipLimit"  INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_columns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "project_columns_projectId_order_idx" ON "project_columns"("projectId", "order");

DO $$ BEGIN
  ALTER TABLE "project_columns" ADD CONSTRAINT "project_columns_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── project_labels ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "project_labels" (
  "id"        TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "color"     TEXT NOT NULL DEFAULT '#6366f1',
  CONSTRAINT "project_labels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_labels_projectId_name_key" ON "project_labels"("projectId", "name");

DO $$ BEGIN
  ALTER TABLE "project_labels" ADD CONSTRAINT "project_labels_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── tasks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tasks" (
  "id"              TEXT             NOT NULL,
  "companyId"       TEXT             NOT NULL,
  "projectId"       TEXT             NOT NULL,
  "columnId"        TEXT             NOT NULL,
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
);
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_projectId_number_key"          ON "tasks"("projectId", "number");
CREATE INDEX        IF NOT EXISTS "tasks_companyId_dueDate_idx"         ON "tasks"("companyId", "dueDate");
CREATE INDEX        IF NOT EXISTS "tasks_projectId_columnId_order_idx"  ON "tasks"("projectId", "columnId", "order");
CREATE INDEX        IF NOT EXISTS "tasks_parentTaskId_idx"              ON "tasks"("parentTaskId");

DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_columnId_fkey"
    FOREIGN KEY ("columnId") REFERENCES "project_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentTaskId_fkey"
    FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── task_assignees ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "task_assignees" (
  "id"         TEXT         NOT NULL,
  "taskId"     TEXT         NOT NULL,
  "employeeId" TEXT         NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_assignees_taskId_employeeId_key" ON "task_assignees"("taskId", "employeeId");
CREATE INDEX        IF NOT EXISTS "task_assignees_employeeId_idx"        ON "task_assignees"("employeeId");

DO $$ BEGIN
  ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── task_labels ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "task_labels" (
  "taskId"  TEXT NOT NULL,
  "labelId" TEXT NOT NULL,
  CONSTRAINT "task_labels_pkey" PRIMARY KEY ("taskId", "labelId")
);
CREATE INDEX IF NOT EXISTS "task_labels_labelId_idx" ON "task_labels"("labelId");

DO $$ BEGIN
  ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_labelId_fkey"
    FOREIGN KEY ("labelId") REFERENCES "project_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── task_checklist_items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "task_checklist_items" (
  "id"        TEXT         NOT NULL,
  "taskId"    TEXT         NOT NULL,
  "text"      TEXT         NOT NULL,
  "isDone"    BOOLEAN      NOT NULL DEFAULT false,
  "order"     INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "task_checklist_items_taskId_order_idx" ON "task_checklist_items"("taskId", "order");

DO $$ BEGIN
  ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── task_comments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "task_comments" (
  "id"        TEXT         NOT NULL,
  "taskId"    TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "body"      TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "task_comments_taskId_createdAt_idx" ON "task_comments"("taskId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── task_activity ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "task_activity" (
  "id"        TEXT         NOT NULL,
  "taskId"    TEXT         NOT NULL,
  "userId"    TEXT,
  "action"    TEXT         NOT NULL,
  "meta"      JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "task_activity_taskId_createdAt_idx" ON "task_activity"("taskId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── task_time_logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "task_time_logs" (
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
);
CREATE INDEX IF NOT EXISTS "task_time_logs_taskId_idx"            ON "task_time_logs"("taskId");
CREATE INDEX IF NOT EXISTS "task_time_logs_employeeId_date_idx"   ON "task_time_logs"("employeeId", "date");

DO $$ BEGIN
  ALTER TABLE "task_time_logs" ADD CONSTRAINT "task_time_logs_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "task_time_logs" ADD CONSTRAINT "task_time_logs_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── task_dependencies ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "task_dependencies" (
  "id"              TEXT         NOT NULL,
  "taskId"          TEXT         NOT NULL,
  "dependsOnTaskId" TEXT         NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_dependencies_taskId_dependsOnTaskId_key" ON "task_dependencies"("taskId", "dependsOnTaskId");
CREATE INDEX        IF NOT EXISTS "task_dependencies_dependsOnTaskId_idx"        ON "task_dependencies"("dependsOnTaskId");

DO $$ BEGIN
  ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependsOnTaskId_fkey"
    FOREIGN KEY ("dependsOnTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── task_attachments + comment @mentions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "task_attachments" (
  "id"               TEXT         NOT NULL,
  "taskId"           TEXT         NOT NULL,
  "fileName"         TEXT         NOT NULL,
  "fileUrl"          TEXT         NOT NULL,
  "fileSize"         INTEGER      NOT NULL,
  "mimeType"         TEXT         NOT NULL,
  "uploadedByUserId" TEXT         NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "task_attachments_taskId_createdAt_idx" ON "task_attachments"("taskId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "task_comments" ADD COLUMN IF NOT EXISTS "mentions" TEXT[] NOT NULL DEFAULT '{}';
