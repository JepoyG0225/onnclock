ALTER TABLE "employee_loans" ADD COLUMN "manualPaidBalance" DECIMAL(12,2), ADD COLUMN "cutoffInstallment" DECIMAL(12,2);

-- Older manual Mark Paid changed status only and retained the last balance.
UPDATE "employee_loans" SET "manualPaidBalance" = "balance", "balance" = 0
WHERE "status" = 'FULLY_PAID' AND "balance" > 0;
-- Preserve existing cutoff installments using the original company-based conversion.
UPDATE "employee_loans" l SET "cutoffInstallment" = CEIL(l."monthlyAmortization" / (CASE c."payFrequency"::text WHEN 'MONTHLY' THEN 1 WHEN 'WEEKLY' THEN 4 WHEN 'DAILY' THEN 22 ELSE 2 END) * 100) / 100
FROM "cash_advance_requests" a LEFT JOIN "payroll_cycle_configs" c ON c."companyId" = a."companyId"
WHERE a."linkedLoanId" = l.id AND a."repaymentCutoffs" IS NOT NULL;

ALTER TABLE "employee_loans" ADD CONSTRAINT "manual_payment_restore_guard"
CHECK ("manualPaidBalance" IS NULL OR ("status" = 'FULLY_PAID' AND "balance" = 0 AND "manualPaidBalance" > 0));
