ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "disableNightDifferential" BOOLEAN NOT NULL DEFAULT false;
