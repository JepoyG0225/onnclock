-- Chat performance indexes on audit_logs
-- Covers: message fetch by (companyId, entity, entityId) ordered by createdAt
CREATE INDEX IF NOT EXISTS "audit_logs_companyId_entity_entityId_createdAt_idx"
  ON "audit_logs"("companyId", "entity", "entityId", "createdAt");

-- Covers: presence groupBy by (companyId, entity, userId) ordered by createdAt
CREATE INDEX IF NOT EXISTS "audit_logs_companyId_entity_userId_createdAt_idx"
  ON "audit_logs"("companyId", "entity", "userId", "createdAt");
