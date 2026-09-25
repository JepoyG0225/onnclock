ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "employeeScheduleSelectionEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "employees"
ADD COLUMN IF NOT EXISTS "canSelectOwnSchedule" BOOLEAN NOT NULL DEFAULT false;
