-- Add workflow-engine approval tracking to the remaining request types.
ALTER TABLE "overtime_requests"
    ADD COLUMN "approvalLevel" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "approvalTrail" JSONB;

ALTER TABLE "cash_advance_requests"
    ADD COLUMN "approvalLevel" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "approvalTrail" JSONB;

ALTER TABLE "budget_requisitions"
    ADD COLUMN "approvalLevel" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "approvalTrail" JSONB;

ALTER TABLE "time_entry_corrections"
    ADD COLUMN "approvalLevel" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "approvalTrail" JSONB;
