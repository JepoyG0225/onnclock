CREATE TABLE IF NOT EXISTS "offline_attendance_events" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "payloadHash" TEXT NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "offline_attendance_events_companyId_employeeId_idx" ON "offline_attendance_events" ("companyId", "employeeId");
