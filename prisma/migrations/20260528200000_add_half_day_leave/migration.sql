-- Add half-day leave support to leave_requests
ALTER TABLE "leave_requests"
  ADD COLUMN IF NOT EXISTS "isHalfDay"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "halfDayPeriod" TEXT;

-- Add half-day fields to dtr_records so payroll can count 0.5 days
ALTER TABLE "dtr_records"
  ADD COLUMN IF NOT EXISTS "isHalfDay"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "halfDayPeriod" TEXT;
