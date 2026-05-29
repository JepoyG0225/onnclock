-- Store manual payslip overrides so they survive recompute.
ALTER TABLE "payslips"
  ADD COLUMN IF NOT EXISTS "manualEdits" JSONB;
