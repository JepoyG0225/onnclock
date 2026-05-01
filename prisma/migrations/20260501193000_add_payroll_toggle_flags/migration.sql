ALTER TABLE "payroll_cycle_configs"
  ADD COLUMN IF NOT EXISTS "enableOvertime" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enableNightDifferential" BOOLEAN NOT NULL DEFAULT true;
