-- CreateTable: company-customizable scorecard competencies
CREATE TABLE "performance_competencies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "performance_competencies_companyId_key_key" ON "performance_competencies"("companyId", "key");

-- CreateIndex
CREATE INDEX "performance_competencies_companyId_isActive_sortOrder_idx" ON "performance_competencies"("companyId", "isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "performance_competencies" ADD CONSTRAINT "performance_competencies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
