-- CreateEnum
CREATE TYPE "RecruitmentVisibility" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RecruitmentStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "OnboardingStepType" AS ENUM ('DOCUMENT', 'VIDEO', 'TASK', 'ORIENTATION', 'SYSTEM_ACCESS', 'POLICY_ACKNOWLEDGEMENT');

-- CreateEnum
CREATE TYPE "OnboardingProcessStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OnboardingStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PerformanceReviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'COMPLETED', 'ACKNOWLEDGED');

-- CreateTable
CREATE TABLE "job_posts" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "department" TEXT,
  "employmentType" TEXT,
  "workSetup" TEXT,
  "location" TEXT,
  "requirements" JSONB NOT NULL DEFAULT '[]',
  "salaryMin" DECIMAL(12,2),
  "salaryMax" DECIMAL(12,2),
  "visibility" "RecruitmentVisibility" NOT NULL DEFAULT 'DRAFT',
  "publicApplyToken" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "closesAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "job_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "jobPostId" TEXT NOT NULL,
  "stage" "RecruitmentStage" NOT NULL DEFAULT 'APPLIED',
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "currentAddress" TEXT,
  "expectedSalary" DECIMAL(12,2),
  "resumeUrl" TEXT,
  "coverLetter" TEXT,
  "requirementAnswers" JSONB NOT NULL DEFAULT '{}',
  "source" TEXT DEFAULT 'PUBLIC_PORTAL',
  "internalNotes" TEXT,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastStageUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedByUserId" TEXT,
  "hiredEmployeeId" TEXT,
  "hiredAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_templates" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "onboarding_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_template_steps" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "stepType" "OnboardingStepType" NOT NULL DEFAULT 'TASK',
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL,
  "dueDaysFromStart" INTEGER,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "onboarding_template_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_processes" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "templateId" TEXT,
  "applicationId" TEXT,
  "status" "OnboardingProcessStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "ownerUserId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "onboarding_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_step_progress" (
  "id" TEXT NOT NULL,
  "processId" TEXT NOT NULL,
  "templateStepId" TEXT,
  "title" TEXT NOT NULL,
  "stepType" "OnboardingStepType" NOT NULL DEFAULT 'TASK',
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL,
  "status" "OnboardingStepStatus" NOT NULL DEFAULT 'PENDING',
  "dueDate" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "assigneeUserId" TEXT,
  "proofUrl" TEXT,
  "notes" TEXT,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "onboarding_step_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "cycleLabel" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "status" "PerformanceReviewStatus" NOT NULL DEFAULT 'DRAFT',
  "overallRating" DECIMAL(4,2),
  "strengths" TEXT,
  "improvementAreas" TEXT,
  "goals" JSONB NOT NULL DEFAULT '[]',
  "competencyScores" JSONB DEFAULT '{}',
  "employeeComment" TEXT,
  "managerComment" TEXT,
  "completedAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_posts_companyId_slug_key" ON "job_posts"("companyId", "slug");
CREATE UNIQUE INDEX "job_posts_publicApplyToken_key" ON "job_posts"("publicApplyToken");
CREATE INDEX "job_posts_companyId_visibility_createdAt_idx" ON "job_posts"("companyId", "visibility", "createdAt");
CREATE INDEX "job_posts_companyId_publishedAt_idx" ON "job_posts"("companyId", "publishedAt");

-- CreateIndex
CREATE INDEX "job_applications_companyId_stage_appliedAt_idx" ON "job_applications"("companyId", "stage", "appliedAt");
CREATE INDEX "job_applications_jobPostId_stage_appliedAt_idx" ON "job_applications"("jobPostId", "stage", "appliedAt");
CREATE INDEX "job_applications_email_appliedAt_idx" ON "job_applications"("email", "appliedAt");

-- CreateIndex
CREATE INDEX "onboarding_templates_companyId_isActive_isDefault_idx" ON "onboarding_templates"("companyId", "isActive", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_template_steps_templateId_sortOrder_key" ON "onboarding_template_steps"("templateId", "sortOrder");
CREATE INDEX "onboarding_template_steps_templateId_stepType_idx" ON "onboarding_template_steps"("templateId", "stepType");

-- CreateIndex
CREATE INDEX "onboarding_processes_companyId_status_createdAt_idx" ON "onboarding_processes"("companyId", "status", "createdAt");
CREATE INDEX "onboarding_processes_employeeId_status_createdAt_idx" ON "onboarding_processes"("employeeId", "status", "createdAt");
CREATE INDEX "onboarding_processes_applicationId_idx" ON "onboarding_processes"("applicationId");

-- CreateIndex
CREATE INDEX "onboarding_step_progress_processId_sortOrder_idx" ON "onboarding_step_progress"("processId", "sortOrder");
CREATE INDEX "onboarding_step_progress_processId_status_idx" ON "onboarding_step_progress"("processId", "status");

-- CreateIndex
CREATE INDEX "performance_reviews_companyId_status_periodEnd_idx" ON "performance_reviews"("companyId", "status", "periodEnd");
CREATE INDEX "performance_reviews_employeeId_periodEnd_idx" ON "performance_reviews"("employeeId", "periodEnd");
CREATE INDEX "performance_reviews_reviewerId_periodEnd_idx" ON "performance_reviews"("reviewerId", "periodEnd");

-- AddForeignKey
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_hiredEmployeeId_fkey" FOREIGN KEY ("hiredEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_template_steps" ADD CONSTRAINT "onboarding_template_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "onboarding_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_processes" ADD CONSTRAINT "onboarding_processes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_processes" ADD CONSTRAINT "onboarding_processes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_processes" ADD CONSTRAINT "onboarding_processes_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "onboarding_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onboarding_processes" ADD CONSTRAINT "onboarding_processes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_step_progress" ADD CONSTRAINT "onboarding_step_progress_processId_fkey" FOREIGN KEY ("processId") REFERENCES "onboarding_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_step_progress" ADD CONSTRAINT "onboarding_step_progress_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "onboarding_template_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;