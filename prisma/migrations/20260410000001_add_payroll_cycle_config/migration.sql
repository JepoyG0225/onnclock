-- CreateTable
CREATE TABLE "payroll_cycle_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payFrequency" "PayFrequency" NOT NULL DEFAULT 'SEMI_MONTHLY',
    "firstCutoffStartDay" INTEGER NOT NULL DEFAULT 1,
    "firstCutoffEndDay" INTEGER NOT NULL DEFAULT 15,
    "secondCutoffStartDay" INTEGER NOT NULL DEFAULT 16,
    "secondCutoffEndDay" INTEGER NOT NULL DEFAULT 31,
    "defaultPayDelayDays" INTEGER NOT NULL DEFAULT 5,
    "nightDifferentialRate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "nightDifferentialStart" TEXT NOT NULL DEFAULT '22:00',
    "nightDifferentialEnd" TEXT NOT NULL DEFAULT '06:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_cycle_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_cycle_configs_companyId_key" ON "payroll_cycle_configs"("companyId");

-- AddForeignKey
ALTER TABLE "payroll_cycle_configs" ADD CONSTRAINT "payroll_cycle_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
