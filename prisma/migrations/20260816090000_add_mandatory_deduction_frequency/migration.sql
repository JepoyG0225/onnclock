DO $$
BEGIN
  CREATE TYPE "MandatoryDeductionFrequency" AS ENUM ('SEMI_MONTHLY', 'MONTHLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "payroll_cycle_configs"
ADD COLUMN IF NOT EXISTS "mandatoryDeductionFrequency" "MandatoryDeductionFrequency" NOT NULL DEFAULT 'SEMI_MONTHLY';
