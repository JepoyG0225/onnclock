-- CreateTable: per-employee recurring other deductions
CREATE TABLE "employee_other_deductions" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_other_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_other_deductions_employeeId_isActive_idx" ON "employee_other_deductions"("employeeId", "isActive");

-- AddForeignKey
ALTER TABLE "employee_other_deductions" ADD CONSTRAINT "employee_other_deductions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
