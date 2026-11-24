ALTER TYPE "ExpenseClaimStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TABLE "expense_claims" ADD COLUMN IF NOT EXISTS "receiptPath" TEXT;
ALTER TABLE "expense_claims" ADD COLUMN IF NOT EXISTS "requestKey" TEXT;
ALTER TABLE "expense_claims" ADD COLUMN IF NOT EXISTS "history" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "expense_claims" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "expense_claims" ADD COLUMN IF NOT EXISTS "paymentReference" TEXT;
ALTER TABLE "expense_claims" ADD COLUMN IF NOT EXISTS "settledAmount" DECIMAL(12,2);
CREATE UNIQUE INDEX IF NOT EXISTS "expense_claims_requestKey_key" ON "expense_claims"("requestKey");
