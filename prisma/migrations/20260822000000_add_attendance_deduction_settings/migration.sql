-- Company-wide control over attendance deductions.
--
--   disableUndertimeDeductions : mirror of the existing disableLateDeductions
--                                toggle, so a company can dock late but not
--                                undertime (or neither).
--   workingDaysPerMonth        : scheduled work days per month. Divisor that
--                                converts a MONTHLY salary into a daily rate,
--                                and from there into the hourly / per-minute
--                                rate charged for late and undertime minutes.
--                                Default 22 = the value previously hardcoded,
--                                so existing companies keep their numbers.

ALTER TABLE "payroll_cycle_configs"
  ADD COLUMN IF NOT EXISTS "disableUndertimeDeductions" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "payroll_cycle_configs"
  ADD COLUMN IF NOT EXISTS "workingDaysPerMonth" DECIMAL(5,2) NOT NULL DEFAULT 22;
