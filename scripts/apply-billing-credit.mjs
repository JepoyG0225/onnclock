/**
 * Add billing credit support:
 *   - Subscription.creditBalance — cached running balance, refunded to
 *     companies when they deactivate an employee mid-cycle and applied
 *     toward the next paid invoice.
 *   - billing_credit_entries — ledger of every credit transaction so
 *     the company can audit how their balance was built up.
 *
 *   node scripts/apply-billing-credit.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "creditBalance" DECIMAL(12, 2) NOT NULL DEFAULT 0;
  `)
  console.log('✓ subscriptions.creditBalance added')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "billing_credit_entries" (
      "id"               TEXT NOT NULL PRIMARY KEY,
      "companyId"        TEXT NOT NULL,
      "amount"           DECIMAL(12, 2) NOT NULL,
      "reason"           TEXT NOT NULL,
      "sourceEmployeeId" TEXT,
      "sourceInvoiceId"  TEXT,
      "notes"            TEXT,
      "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  console.log('✓ billing_credit_entries table created (or already exists)')

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "billing_credit_entries_company_created_idx"
      ON "billing_credit_entries" ("companyId", "createdAt");
  `)
  console.log('✓ index billing_credit_entries_company_created_idx ready')
} catch (e) {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exit(1)
}
await prisma.$disconnect()
