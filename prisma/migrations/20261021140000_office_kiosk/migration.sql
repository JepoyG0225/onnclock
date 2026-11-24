CREATE TABLE IF NOT EXISTS "office_kiosks" (
 "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL UNIQUE REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "name" TEXT NOT NULL DEFAULT 'Office kiosk', "tokenHash" TEXT UNIQUE, "pairHash" TEXT UNIQUE, "pairExpiresAt" TIMESTAMP(3),
 "pairedAt" TIMESTAMP(3), "lastSeenAt" TIMESTAMP(3), "lastChallengeAt" TIMESTAMP(3), "busyUntil" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "office_kiosk_attempts" (
 "id" TEXT PRIMARY KEY, "kioskId" TEXT NOT NULL REFERENCES "office_kiosks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "employeeId" TEXT NOT NULL, "action" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'CHALLENGE', "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "result" JSONB
);
CREATE INDEX IF NOT EXISTS "office_kiosk_attempts_kioskId_employeeId_createdAt_idx" ON "office_kiosk_attempts"("kioskId", "employeeId", "createdAt");
