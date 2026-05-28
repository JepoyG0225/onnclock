-- Add PayMongo single-transfer ID to disbursement items
-- so the status-polling route can query each transfer individually.

ALTER TABLE "payroll_disbursement_items"
  ADD COLUMN IF NOT EXISTS "pmTransferId" TEXT;
