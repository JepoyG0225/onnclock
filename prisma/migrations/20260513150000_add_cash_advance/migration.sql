-- 1. New enum value on the existing LoanType
ALTER TYPE "LoanType" ADD VALUE IF NOT EXISTS 'CASH_ADVANCE';

-- 2. New enum for the cash-advance request status
DO $$ BEGIN
  CREATE TYPE "CashAdvanceStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. The cash advance request table
CREATE TABLE IF NOT EXISTS "cash_advance_requests" (
  "id"              TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "employeeId"      TEXT NOT NULL,
  "amountRequested" DECIMAL(12, 2) NOT NULL,
  "reason"          TEXT NOT NULL,
  "repaymentMonths" INTEGER NOT NULL DEFAULT 1,
  "status"          "CashAdvanceStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById"    TEXT,
  "approvedAt"      TIMESTAMP(3),
  "rejectionReason" TEXT,
  "linkedLoanId"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cash_advance_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_advance_requests_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cash_advance_requests_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cash_advance_requests_linkedLoanId_fkey"
    FOREIGN KEY ("linkedLoanId") REFERENCES "employee_loans"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cash_advance_requests_linkedLoanId_key"
  ON "cash_advance_requests"("linkedLoanId");
CREATE INDEX IF NOT EXISTS "cash_advance_requests_companyId_status_createdAt_idx"
  ON "cash_advance_requests"("companyId","status","createdAt");
CREATE INDEX IF NOT EXISTS "cash_advance_requests_employeeId_status_idx"
  ON "cash_advance_requests"("employeeId","status");
