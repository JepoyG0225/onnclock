-- CreateEnum
CREATE TYPE "BudgetRequisitionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "budget_requisitions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" "BudgetRequisitionStatus" NOT NULL DEFAULT 'PENDING',
    "neededBy" DATE,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_requisition_items" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_requisition_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_requisitions_companyId_status_idx" ON "budget_requisitions"("companyId", "status");

-- CreateIndex
CREATE INDEX "budget_requisitions_employeeId_createdAt_idx" ON "budget_requisitions"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "budget_requisition_items_requisitionId_idx" ON "budget_requisition_items"("requisitionId");

-- AddForeignKey
ALTER TABLE "budget_requisitions" ADD CONSTRAINT "budget_requisitions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_requisitions" ADD CONSTRAINT "budget_requisitions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_requisition_items" ADD CONSTRAINT "budget_requisition_items_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "budget_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
