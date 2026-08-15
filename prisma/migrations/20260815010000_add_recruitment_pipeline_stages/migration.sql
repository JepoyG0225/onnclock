CREATE TABLE "recruitment_pipeline_stages" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#0b6ffb',
  "category" "RecruitmentStage" NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recruitment_pipeline_stages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "job_applications" ADD COLUMN "pipelineStageId" TEXT;

CREATE UNIQUE INDEX "recruitment_pipeline_stages_companyId_name_key"
  ON "recruitment_pipeline_stages"("companyId", "name");
CREATE INDEX "recruitment_pipeline_stages_companyId_order_idx"
  ON "recruitment_pipeline_stages"("companyId", "order");
CREATE INDEX "job_applications_companyId_pipelineStageId_appliedAt_idx"
  ON "job_applications"("companyId", "pipelineStageId", "appliedAt");

ALTER TABLE "recruitment_pipeline_stages"
  ADD CONSTRAINT "recruitment_pipeline_stages_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_applications"
  ADD CONSTRAINT "job_applications_pipelineStageId_fkey"
  FOREIGN KEY ("pipelineStageId") REFERENCES "recruitment_pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
