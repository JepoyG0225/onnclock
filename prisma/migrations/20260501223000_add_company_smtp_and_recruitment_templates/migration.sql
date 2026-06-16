ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "smtpHost" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpPort" INTEGER,
  ADD COLUMN IF NOT EXISTS "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "smtpUser" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpPass" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpFromEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "smtpFromName" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecruitmentEmailTemplateType') THEN
    CREATE TYPE "RecruitmentEmailTemplateType" AS ENUM ('INTERVIEW', 'REJECTION', 'OFFER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "recruitment_email_templates" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type" "RecruitmentEmailTemplateType" NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recruitment_email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "recruitment_email_templates_companyId_type_key"
  ON "recruitment_email_templates" ("companyId", "type");

CREATE INDEX IF NOT EXISTS "recruitment_email_templates_companyId_isActive_idx"
  ON "recruitment_email_templates" ("companyId", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recruitment_email_templates_companyId_fkey'
  ) THEN
    ALTER TABLE "recruitment_email_templates"
      ADD CONSTRAINT "recruitment_email_templates_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
