CREATE TABLE "certificate_templates" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "companyId" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "name" TEXT NOT NULL,
 "backgroundPath" TEXT NOT NULL,
 "backgroundMime" TEXT NOT NULL,
 "width" DOUBLE PRECISION NOT NULL,
 "height" DOUBLE PRECISION NOT NULL,
 "fields" JSONB NOT NULL DEFAULT '[]',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "certificate_templates_companyId_idx" ON "certificate_templates"("companyId");
ALTER TABLE "learning_courses" ADD COLUMN "certificateTemplateId" TEXT REFERENCES "certificate_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee_certifications" ADD COLUMN "templateSnapshot" JSONB;
