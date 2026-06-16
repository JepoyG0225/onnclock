-- AlterTable
ALTER TABLE `leave_requests` ADD COLUMN `approvalLevel` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `approvalTrail` JSON NOT NULL;

-- AlterTable
ALTER TABLE `payroll_runs` ADD COLUMN `approvalLevel` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `approvalTrail` JSON NOT NULL;
