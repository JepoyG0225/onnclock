-- Multi-shift per day support for DTR records.
-- An employee can now have more than one DTR row per calendar date,
-- one per shift assignment they clock in/out for. Drop the previous
-- unique constraint that enforced one record per (employeeId, date).

DROP INDEX IF EXISTS "dtr_records_employeeId_date_key";
