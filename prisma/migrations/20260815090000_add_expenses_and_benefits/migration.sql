CREATE TYPE "ExpenseClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');
CREATE TYPE "BenefitPlanType" AS ENUM ('HMO', 'LIFE_INSURANCE', 'RETIREMENT', 'WELLNESS', 'ALLOWANCE', 'OTHER');
CREATE TYPE "BenefitEnrollmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'WAIVED', 'ENDED');

CREATE TABLE "expense_claims" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "expenseDate" DATE NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "approvedAmount" DECIMAL(12,2),
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "receiptUrl" TEXT,
  "receiptFileName" TEXT,
  "isLiquidation" BOOLEAN NOT NULL DEFAULT false,
  "cashAdvanceAmount" DECIMAL(12,2),
  "status" "ExpenseClaimStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "expense_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "benefit_plans" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "provider" TEXT,
  "type" "BenefitPlanType" NOT NULL DEFAULT 'HMO',
  "description" TEXT,
  "employerShare" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "employeeShare" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "dependentLimit" INTEGER NOT NULL DEFAULT 0,
  "eligibilityMonths" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "benefit_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_benefit_enrollments" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "benefitPlanId" TEXT NOT NULL,
  "status" "BenefitEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "effectiveDate" DATE NOT NULL,
  "endDate" DATE,
  "memberNumber" TEXT,
  "dependents" JSONB NOT NULL DEFAULT '[]',
  "employeeShare" DECIMAL(12,2),
  "employerShare" DECIMAL(12,2),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_benefit_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_claims_companyId_status_createdAt_idx" ON "expense_claims"("companyId", "status", "createdAt");
CREATE INDEX "expense_claims_employeeId_status_idx" ON "expense_claims"("employeeId", "status");
CREATE INDEX "benefit_plans_companyId_isActive_idx" ON "benefit_plans"("companyId", "isActive");
CREATE UNIQUE INDEX "employee_benefit_enrollments_employeeId_benefitPlanId_key" ON "employee_benefit_enrollments"("employeeId", "benefitPlanId");
CREATE INDEX "employee_benefit_enrollments_benefitPlanId_status_idx" ON "employee_benefit_enrollments"("benefitPlanId", "status");

ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benefit_plans" ADD CONSTRAINT "benefit_plans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_benefit_enrollments" ADD CONSTRAINT "employee_benefit_enrollments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_benefit_enrollments" ADD CONSTRAINT "employee_benefit_enrollments_benefitPlanId_fkey" FOREIGN KEY ("benefitPlanId") REFERENCES "benefit_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
