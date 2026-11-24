CREATE TABLE IF NOT EXISTS "attendance_activities" (
  "id" TEXT PRIMARY KEY,
  "description" VARCHAR(2000) NOT NULL,
  "photo" TEXT,
  "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dtrRecordId" TEXT NOT NULL REFERENCES "dtr_records"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "attendance_activities_dtrRecordId_loggedAt_idx" ON "attendance_activities"("dtrRecordId", "loggedAt");
