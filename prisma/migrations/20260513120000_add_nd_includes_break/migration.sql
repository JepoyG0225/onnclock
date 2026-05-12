ALTER TABLE "payroll_cycle_configs"
  ADD COLUMN IF NOT EXISTS "nightDifferentialIncludesBreak" BOOLEAN NOT NULL DEFAULT false;
