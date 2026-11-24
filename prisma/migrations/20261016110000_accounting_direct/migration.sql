ALTER TABLE "accounting_connections" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'PHP';
ALTER TABLE "accounting_connections" ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "accounting_connections" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "accounting_connections" ADD COLUMN IF NOT EXISTS "refreshLeaseUntil" TIMESTAMP(3);
ALTER TABLE "accounting_sync_records" ADD COLUMN IF NOT EXISTS "payload" JSONB;
