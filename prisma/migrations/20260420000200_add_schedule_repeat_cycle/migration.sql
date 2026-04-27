-- Add repeat cycle fields to work_schedules
ALTER TABLE "work_schedules"
  ADD COLUMN IF NOT EXISTS "repeatCycle"    TEXT         NOT NULL DEFAULT 'WEEKLY',
  ADD COLUMN IF NOT EXISTS "cycleWeeks"     JSONB,
  ADD COLUMN IF NOT EXISTS "cycleStartDate" TIMESTAMP(3);

-- Create employee_shift_assignments table for per-day scheduling grid
CREATE TABLE IF NOT EXISTS "employee_shift_assignments" (
  "id"         TEXT         NOT NULL,
  "companyId"  TEXT         NOT NULL,
  "employeeId" TEXT         NOT NULL,
  "date"       DATE         NOT NULL,
  "scheduleId" TEXT,
  "timeIn"     TEXT,
  "timeOut"    TEXT,
  "isRestDay"  BOOLEAN      NOT NULL DEFAULT false,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_shift_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_shift_assignments_employeeId_date_key"
  ON "employee_shift_assignments"("employeeId", "date");

CREATE INDEX IF NOT EXISTS "employee_shift_assignments_companyId_date_idx"
  ON "employee_shift_assignments"("companyId", "date");

DO $$ BEGIN
  ALTER TABLE "employee_shift_assignments"
    ADD CONSTRAINT "esa_company_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "employee_shift_assignments"
    ADD CONSTRAINT "esa_employee_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "employee_shift_assignments"
    ADD CONSTRAINT "esa_schedule_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "work_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
