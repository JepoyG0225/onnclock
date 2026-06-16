-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('GCASH', 'BANK_TRANSFER', 'E_WALLET', 'OTHER');

-- AlterTable
ALTER TABLE "invoices"
ADD COLUMN "paymentMethodCode" TEXT,
ADD COLUMN "paymentMethodLabel" TEXT;

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL DEFAULT 'OTHER',
    "bankName" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "instructions" TEXT,
    "qrImageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_code_key" ON "payment_methods"("code");
