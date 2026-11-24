ALTER TABLE "work_schedules" ADD COLUMN "attendanceLocation" JSONB;
ALTER TABLE "dtr_records" ADD COLUMN "attendanceLocation" JSONB;

CREATE TABLE "leave_encashments" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "balanceId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "incomeTypeId" TEXT NOT NULL,
  "days" DECIMAL(6,2) NOT NULL CHECK ("days" > 0),
  "dailyRate" DECIMAL(12,2) NOT NULL CHECK ("dailyRate" > 0),
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "isTaxable" BOOLEAN NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "leave_encashments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leave_encashments_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "leave_balances"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "leave_encashments_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "leave_encashments_incomeTypeId_fkey" FOREIGN KEY ("incomeTypeId") REFERENCES "income_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "leave_encashments_companyId_payrollRunId_status_idx" ON "leave_encashments"("companyId", "payrollRunId", "status");

ALTER TABLE "payroll_runs" ADD COLUMN "computationStartedAt" TIMESTAMP(3);
