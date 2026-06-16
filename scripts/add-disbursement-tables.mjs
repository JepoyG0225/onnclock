import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Running disbursement migration…')

  // 1. Company — disbursement wallet fields
  const companyCols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'disbursementBalance'`
  if (companyCols.length === 0) {
    console.log('Adding disbursement columns to companies…')
    await prisma.$executeRaw`
      ALTER TABLE "companies"
        ADD COLUMN "disbursementBalance"           DECIMAL(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN "disbursementSourceAccountNo"   TEXT,
        ADD COLUMN "disbursementSourceAccountName" TEXT,
        ADD COLUMN "disbursementSourceBic"         TEXT`
  } else {
    console.log('Company disbursement columns already exist — skipping.')
  }

  // 2. Employee — bankBic
  const empCols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'bankBic'`
  if (empCols.length === 0) {
    console.log('Adding bankBic to employees…')
    await prisma.$executeRaw`ALTER TABLE "employees" ADD COLUMN "bankBic" TEXT`
  } else {
    console.log('employees.bankBic already exists — skipping.')
  }

  // 3. disbursement_top_ups
  const topUpExists = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'disbursement_top_ups'`
  if (topUpExists.length === 0) {
    console.log('Creating disbursement_top_ups…')
    await prisma.$executeRaw`
      CREATE TABLE "disbursement_top_ups" (
        "id"              TEXT        NOT NULL PRIMARY KEY,
        "companyId"       TEXT        NOT NULL REFERENCES "companies"("id"),
        "amountPeso"      DECIMAL(12,2) NOT NULL,
        "status"          TEXT        NOT NULL DEFAULT 'PENDING',
        "paymentIntentId" TEXT,
        "qrImage"         TEXT,
        "expiresAt"       TIMESTAMPTZ,
        "confirmedAt"     TIMESTAMPTZ,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    await prisma.$executeRaw`
      CREATE INDEX "disbursement_top_ups_companyId_createdAt_idx"
        ON "disbursement_top_ups"("companyId", "createdAt")`
  } else {
    console.log('disbursement_top_ups already exists — skipping.')
  }

  // 4. payroll_disbursements
  const disbExists = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'payroll_disbursements'`
  if (disbExists.length === 0) {
    console.log('Creating payroll_disbursements…')
    await prisma.$executeRaw`
      CREATE TABLE "payroll_disbursements" (
        "id"              TEXT        NOT NULL PRIMARY KEY,
        "companyId"       TEXT        NOT NULL REFERENCES "companies"("id"),
        "payrollRunId"    TEXT        NOT NULL UNIQUE REFERENCES "payroll_runs"("id"),
        "totalAmount"     DECIMAL(14,2) NOT NULL,
        "status"          TEXT        NOT NULL DEFAULT 'PENDING',
        "batchTransferId" TEXT,
        "initiatedBy"     TEXT        NOT NULL,
        "initiatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "completedAt"     TIMESTAMPTZ,
        "notes"           TEXT,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    await prisma.$executeRaw`
      CREATE INDEX "payroll_disbursements_companyId_createdAt_idx"
        ON "payroll_disbursements"("companyId", "createdAt")`
  } else {
    console.log('payroll_disbursements already exists — skipping.')
  }

  // 5. payroll_disbursement_items
  const itemsExist = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'payroll_disbursement_items'`
  if (itemsExist.length === 0) {
    console.log('Creating payroll_disbursement_items…')
    await prisma.$executeRaw`
      CREATE TABLE "payroll_disbursement_items" (
        "id"             TEXT        NOT NULL PRIMARY KEY,
        "disbursementId" TEXT        NOT NULL REFERENCES "payroll_disbursements"("id") ON DELETE CASCADE,
        "payslipId"      TEXT        NOT NULL UNIQUE,
        "employeeId"     TEXT        NOT NULL,
        "employeeName"   TEXT        NOT NULL,
        "bankName"       TEXT,
        "bankAccountNo"  TEXT,
        "bankBic"        TEXT,
        "amount"         DECIMAL(12,2) NOT NULL,
        "channel"        TEXT        NOT NULL,
        "status"         TEXT        NOT NULL DEFAULT 'PENDING',
        "referenceNo"    TEXT,
        "failureReason"  TEXT,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    await prisma.$executeRaw`
      CREATE INDEX "payroll_disbursement_items_disbursementId_idx"
        ON "payroll_disbursement_items"("disbursementId")`
  } else {
    console.log('payroll_disbursement_items already exists — skipping.')
  }

  console.log('Disbursement migration complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
