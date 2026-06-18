-- Add configurable EMR divisor (working days per month) to payroll config.
ALTER TABLE "payroll_cycle_configs"
  ADD COLUMN IF NOT EXISTS "workingDaysPerMonth" DECIMAL(5,2) NOT NULL DEFAULT 22;
