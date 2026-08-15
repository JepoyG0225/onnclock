ALTER TABLE "recruitment_document_templates" ADD COLUMN "paperSize" TEXT NOT NULL DEFAULT 'A4';
ALTER TABLE "recruitment_documents" ADD COLUMN "paperSize" TEXT NOT NULL DEFAULT 'A4';
