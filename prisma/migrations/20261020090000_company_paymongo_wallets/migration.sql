CREATE TABLE IF NOT EXISTS "company_paymongo_wallets" (
  "companyId" TEXT PRIMARY KEY REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accountId" TEXT UNIQUE,
  "walletId" TEXT UNIQUE,
  "livemode" BOOLEAN NOT NULL,
  "profileEncrypted" TEXT,
  "documents" JSONB NOT NULL DEFAULT '[]',
  "consentedBy" TEXT NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activationStatus" TEXT NOT NULL DEFAULT 'pending',
  "identityStatus" TEXT NOT NULL DEFAULT 'pending',
  "verificationEncrypted" TEXT,
  "kybRequestId" TEXT UNIQUE,
  "webhookId" TEXT,
  "webhookSecretEncrypted" TEXT,
  "kybStatus" TEXT NOT NULL DEFAULT 'not_submitted',
  "reviewerNote" JSONB,
  "walletStatus" TEXT,
  "walletType" TEXT,
  "operation" TEXT,
  "operationKey" TEXT,
  "operationStartedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "payroll_disbursements" ADD COLUMN IF NOT EXISTS "pmAccountId" TEXT;
CREATE TABLE IF NOT EXISTS "disbursement_transfer_attempts" (
  "id" TEXT PRIMARY KEY,
  "itemId" TEXT NOT NULL REFERENCES "payroll_disbursement_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "accountId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "batchId" TEXT,
  "transferId" TEXT UNIQUE,
  "feeCentavos" INTEGER,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "disbursement_transfer_attempts_itemId_createdAt_idx" ON "disbursement_transfer_attempts"("itemId", "createdAt");
