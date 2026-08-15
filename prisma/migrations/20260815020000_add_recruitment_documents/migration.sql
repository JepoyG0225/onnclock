CREATE TYPE "RecruitmentDocumentType" AS ENUM ('JOB_OFFER', 'EMPLOYMENT_CONTRACT', 'OTHER');
CREATE TYPE "RecruitmentDocumentStatus" AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'DECLINED', 'VOID');

CREATE TABLE "recruitment_document_templates" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "RecruitmentDocumentType" NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "signatories" JSONB NOT NULL DEFAULT '[]',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recruitment_document_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recruitment_documents" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "templateId" TEXT,
  "type" "RecruitmentDocumentType" NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "signatories" JSONB NOT NULL DEFAULT '[]',
  "status" "RecruitmentDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "publicToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recruitment_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recruitment_document_templates_companyId_type_isActive_idx" ON "recruitment_document_templates"("companyId", "type", "isActive");
CREATE UNIQUE INDEX "recruitment_documents_publicToken_key" ON "recruitment_documents"("publicToken");
CREATE INDEX "recruitment_documents_companyId_applicationId_status_idx" ON "recruitment_documents"("companyId", "applicationId", "status");
CREATE INDEX "recruitment_documents_publicToken_status_idx" ON "recruitment_documents"("publicToken", "status");
ALTER TABLE "recruitment_document_templates" ADD CONSTRAINT "recruitment_document_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_documents" ADD CONSTRAINT "recruitment_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_documents" ADD CONSTRAINT "recruitment_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_documents" ADD CONSTRAINT "recruitment_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "recruitment_document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
