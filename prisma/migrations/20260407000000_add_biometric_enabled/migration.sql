-- AlterTable
ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "fingerprintRequired" BOOLEAN NOT NULL DEFAULT true;
