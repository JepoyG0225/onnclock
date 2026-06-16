-- CreateEnum
CREATE TYPE "IncomeTypeMode" AS ENUM ('FIXED', 'VARIABLE');

-- CreateTable
CREATE TABLE "income_types" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "mode" "IncomeTypeMode" NOT NULL DEFAULT 'VARIABLE',
    "defaultAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_income_assignments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "incomeTypeId" TEXT NOT NULL,
    "fixedAmount" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_income_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_run_income_entries" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "incomeTypeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_run_income_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_incomes" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "incomeTypeId" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isTaxable" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "income_types_companyId_name_key" ON "income_types"("companyId", "name");

-- CreateIndex
CREATE INDEX "income_types_companyId_isActive_idx" ON "income_types"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "employee_income_assignments_employeeId_incomeTypeId_key" ON "employee_income_assignments"("employeeId", "incomeTypeId");

-- CreateIndex
CREATE INDEX "employee_income_assignments_employeeId_isActive_idx" ON "employee_income_assignments"("employeeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_income_entries_payrollRunId_employeeId_incomeTypeId_key" ON "payroll_run_income_entries"("payrollRunId", "employeeId", "incomeTypeId");

-- CreateIndex
CREATE INDEX "payroll_run_income_entries_payrollRunId_employeeId_idx" ON "payroll_run_income_entries"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "payslip_incomes_payslipId_idx" ON "payslip_incomes"("payslipId");

-- CreateIndex
CREATE INDEX "payslip_incomes_incomeTypeId_idx" ON "payslip_incomes"("incomeTypeId");

-- AddForeignKey
ALTER TABLE "income_types" ADD CONSTRAINT "income_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_income_assignments" ADD CONSTRAINT "employee_income_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_income_assignments" ADD CONSTRAINT "employee_income_assignments_incomeTypeId_fkey" FOREIGN KEY ("incomeTypeId") REFERENCES "income_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run_income_entries" ADD CONSTRAINT "payroll_run_income_entries_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run_income_entries" ADD CONSTRAINT "payroll_run_income_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run_income_entries" ADD CONSTRAINT "payroll_run_income_entries_incomeTypeId_fkey" FOREIGN KEY ("incomeTypeId") REFERENCES "income_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_incomes" ADD CONSTRAINT "payslip_incomes_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_incomes" ADD CONSTRAINT "payslip_incomes_incomeTypeId_fkey" FOREIGN KEY ("incomeTypeId") REFERENCES "income_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
