-- Per-employee mandatory deduction enable/disable flags
ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "sssEnabled"            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "philhealthEnabled"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "pagibigEnabled"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "withholdingTaxEnabled" BOOLEAN NOT NULL DEFAULT true;
