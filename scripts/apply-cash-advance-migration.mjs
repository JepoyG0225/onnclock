/**
 * Apply the 20260513150000_add_cash_advance migration directly to the
 * production database via Prisma. Idempotent — every CREATE / ALTER
 * uses IF NOT EXISTS so re-running is a no-op.
 *
 * Run with the production DATABASE_URL set (see .env / .env.local).
 *
 *   node scripts/apply-cash-advance-migration.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const MIGRATION_NAME = '20260513150000_add_cash_advance'

const statements = [
  // 1. New enum value on the existing LoanType — ADD VALUE IF NOT EXISTS
  // requires the statement to run in its own transaction.
  `ALTER TYPE "LoanType" ADD VALUE IF NOT EXISTS 'CASH_ADVANCE';`,

  // 2. Status enum
  `DO $$ BEGIN
     CREATE TYPE "CashAdvanceStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // 3. Table with FKs
  `CREATE TABLE IF NOT EXISTS "cash_advance_requests" (
     "id"              TEXT NOT NULL,
     "companyId"       TEXT NOT NULL,
     "employeeId"      TEXT NOT NULL,
     "amountRequested" DECIMAL(12, 2) NOT NULL,
     "reason"          TEXT NOT NULL,
     "repaymentMonths" INTEGER NOT NULL DEFAULT 1,
     "status"          "CashAdvanceStatus" NOT NULL DEFAULT 'PENDING',
     "approvedById"    TEXT,
     "approvedAt"      TIMESTAMP(3),
     "rejectionReason" TEXT,
     "linkedLoanId"    TEXT,
     "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt"       TIMESTAMP(3) NOT NULL,
     CONSTRAINT "cash_advance_requests_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "cash_advance_requests_companyId_fkey"
       FOREIGN KEY ("companyId") REFERENCES "companies"("id")
       ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT "cash_advance_requests_employeeId_fkey"
       FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
       ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT "cash_advance_requests_linkedLoanId_fkey"
       FOREIGN KEY ("linkedLoanId") REFERENCES "employee_loans"("id")
       ON DELETE SET NULL ON UPDATE CASCADE
   );`,

  // 4. Indexes
  `CREATE UNIQUE INDEX IF NOT EXISTS "cash_advance_requests_linkedLoanId_key"
     ON "cash_advance_requests"("linkedLoanId");`,
  `CREATE INDEX IF NOT EXISTS "cash_advance_requests_companyId_status_createdAt_idx"
     ON "cash_advance_requests"("companyId","status","createdAt");`,
  `CREATE INDEX IF NOT EXISTS "cash_advance_requests_employeeId_status_idx"
     ON "cash_advance_requests"("employeeId","status");`,
]

async function main() {
  console.log(`Applying ${MIGRATION_NAME}…`)
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    try {
      await prisma.$executeRawUnsafe(stmt)
      console.log(`  ✓ statement ${i + 1}/${statements.length}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // ADD VALUE IF NOT EXISTS surfaces as "already exists" on some PG versions — ignore.
      if (/already exists/i.test(msg) || /duplicate_object/i.test(msg)) {
        console.log(`  ↳ statement ${i + 1} already applied — skipping`)
      } else {
        console.error(`  ✗ statement ${i + 1} failed:`, msg)
        throw e
      }
    }
  }

  // Mark migration as applied in Prisma's tracker (best-effort).
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
      SELECT gen_random_uuid()::text, 'manual', NOW(), '${MIGRATION_NAME}', NOW(), 1
      WHERE NOT EXISTS (
        SELECT 1 FROM _prisma_migrations WHERE migration_name = '${MIGRATION_NAME}'
      );
    `)
    console.log(`✓ Marked ${MIGRATION_NAME} in _prisma_migrations`)
  } catch (e) {
    console.log(`(skipped recording in _prisma_migrations: ${e instanceof Error ? e.message : e})`)
  }

  // Sanity-check the resulting table
  const row = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM cash_advance_requests;`,
  )
  console.log('cash_advance_requests row count →', row)

  console.log(`✅ ${MIGRATION_NAME} applied successfully`)
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
