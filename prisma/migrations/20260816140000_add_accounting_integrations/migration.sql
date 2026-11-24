CREATE TABLE "accounting_connections" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tenantName" TEXT,
  "accessTokenEncrypted" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "accountMappings" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "lastSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accounting_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounting_sync_records" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "externalId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "payloadHash" TEXT,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "syncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accounting_sync_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_connections_companyId_provider_key" ON "accounting_connections"("companyId", "provider");
CREATE INDEX "accounting_connections_companyId_status_idx" ON "accounting_connections"("companyId", "status");
CREATE UNIQUE INDEX "accounting_sync_records_provider_sourceType_sourceId_key" ON "accounting_sync_records"("provider", "sourceType", "sourceId");
CREATE INDEX "accounting_sync_records_companyId_status_updatedAt_idx" ON "accounting_sync_records"("companyId", "status", "updatedAt");
ALTER TABLE "accounting_connections" ADD CONSTRAINT "accounting_connections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_sync_records" ADD CONSTRAINT "accounting_sync_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_sync_records" ADD CONSTRAINT "accounting_sync_records_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "accounting_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
