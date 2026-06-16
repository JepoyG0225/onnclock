ALTER TABLE "companies"
  ADD COLUMN "selfieRequired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "employees"
  ADD COLUMN "fingerprintExempt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "geofenceExempt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selfieExempt" BOOLEAN NOT NULL DEFAULT false;
