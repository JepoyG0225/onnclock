-- Adds the auto-clockout configuration columns to companies.
-- The desktop app polls Electron's powerMonitor.getSystemIdleTime() and
-- triggers the standard /api/attendance/clock-out flow when the threshold
-- is reached. Defaults keep the feature off; admins flip it on per company.

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "autoClockoutEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "autoClockoutMinutes" INTEGER NOT NULL DEFAULT 10;
