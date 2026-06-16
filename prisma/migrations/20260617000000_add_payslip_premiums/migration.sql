-- CreateTable: itemized DOLE premium-pay lines per payslip (LH, LHND, rest day, ND, OT variants)
CREATE TABLE "payslip_premiums" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL,
    "multiplier" DECIMAL(6,3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_premiums_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payslip_premiums_payslipId_idx" ON "payslip_premiums"("payslipId");

-- AddForeignKey
ALTER TABLE "payslip_premiums" ADD CONSTRAINT "payslip_premiums_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
