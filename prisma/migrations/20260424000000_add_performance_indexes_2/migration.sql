-- Add index on holidays(companyId, date) — queried on every clock-in
CREATE INDEX IF NOT EXISTS "holidays_companyId_date_idx" ON "holidays"("companyId", "date");

-- Add index on dtr_records(employeeId, timeOut) — used to find active open shifts
CREATE INDEX IF NOT EXISTS "dtr_records_employeeId_timeOut_idx" ON "dtr_records"("employeeId", "timeOut");

-- Add composite index on leave_requests for the clock-in leave-coverage check
CREATE INDEX IF NOT EXISTS "leave_requests_employeeId_status_startDate_endDate_idx"
  ON "leave_requests"("employeeId", "status", "startDate", "endDate");
