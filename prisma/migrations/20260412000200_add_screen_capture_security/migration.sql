ALTER TABLE "companies"
  ADD COLUMN "screenCaptureEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "screenCaptureFrequencyMinutes" INTEGER NOT NULL DEFAULT 5;

CREATE TABLE "attendance_screenshots" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "dtrRecordId" TEXT NOT NULL,
  "imageDataUrl" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attendance_screenshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_screenshots_companyId_capturedAt_idx" ON "attendance_screenshots"("companyId", "capturedAt");
CREATE INDEX "attendance_screenshots_employeeId_capturedAt_idx" ON "attendance_screenshots"("employeeId", "capturedAt");
CREATE INDEX "attendance_screenshots_dtrRecordId_capturedAt_idx" ON "attendance_screenshots"("dtrRecordId", "capturedAt");

ALTER TABLE "attendance_screenshots"
  ADD CONSTRAINT "attendance_screenshots_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_screenshots"
  ADD CONSTRAINT "attendance_screenshots_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_screenshots"
  ADD CONSTRAINT "attendance_screenshots_dtrRecordId_fkey"
  FOREIGN KEY ("dtrRecordId") REFERENCES "dtr_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
