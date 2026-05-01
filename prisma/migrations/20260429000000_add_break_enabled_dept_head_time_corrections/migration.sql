-- AlterEnum: add DEPARTMENT_HEAD to UserRole
ALTER TYPE "UserRole" ADD VALUE 'DEPARTMENT_HEAD';

-- AlterTable: add managedDepartmentId to user_companies
ALTER TABLE "user_companies" ADD COLUMN "managedDepartmentId" TEXT;

-- AlterTable: add breakEnabled to work_schedules
ALTER TABLE "work_schedules" ADD COLUMN "breakEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateEnum: TimeEntryCorrectionStatus
CREATE TYPE "TimeEntryCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable: time_entry_corrections
CREATE TABLE "time_entry_corrections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dtrRecordId" TEXT,
    "date" DATE NOT NULL,
    "timeIn" TEXT,
    "timeOut" TEXT,
    "breakIn" TEXT,
    "breakOut" TEXT,
    "reason" TEXT NOT NULL,
    "status" "TimeEntryCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entry_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_entry_corrections_companyId_status_idx" ON "time_entry_corrections"("companyId", "status");

-- CreateIndex
CREATE INDEX "time_entry_corrections_employeeId_createdAt_idx" ON "time_entry_corrections"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "time_entry_corrections" ADD CONSTRAINT "time_entry_corrections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry_corrections" ADD CONSTRAINT "time_entry_corrections_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
