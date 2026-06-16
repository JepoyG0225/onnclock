/**
 * Apply the digital-signature + HIRED-email migration directly to prod.
 * Idempotent — every CREATE / ALTER uses IF NOT EXISTS.
 *
 *   node scripts/apply-signature-migration.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const MIGRATION_NAME = '20260514120000_digital_signature_and_hired_email'

const statements = [
  // 1. HIRED added to recruitment email template enum
  `ALTER TYPE "RecruitmentEmailTemplateType" ADD VALUE IF NOT EXISTS 'HIRED';`,

  // 2. Employee.signatureDataUrl + signatureCapturedAt (quick-store)
  `ALTER TABLE "employees"
     ADD COLUMN IF NOT EXISTS "signatureDataUrl" TEXT,
     ADD COLUMN IF NOT EXISTS "signatureCapturedAt" TIMESTAMP(3);`,

  // 3. Signatures audit table
  `CREATE TABLE IF NOT EXISTS "signatures" (
     "id"               TEXT NOT NULL,
     "companyId"        TEXT NOT NULL,
     "employeeId"       TEXT,
     "signerName"       TEXT NOT NULL,
     "signerEmail"      TEXT,
     "documentType"     TEXT NOT NULL,
     "documentRefId"    TEXT,
     "documentTitle"    TEXT,
     "signatureDataUrl" TEXT NOT NULL,
     "typedName"        TEXT,
     "ipAddress"        TEXT,
     "userAgent"        TEXT,
     "signedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "signatures_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "signatures_companyId_fkey"
       FOREIGN KEY ("companyId") REFERENCES "companies"("id")
       ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT "signatures_employeeId_fkey"
       FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
       ON DELETE SET NULL ON UPDATE CASCADE
   );`,

  `CREATE INDEX IF NOT EXISTS "signatures_companyId_documentType_documentRefId_idx"
     ON "signatures"("companyId","documentType","documentRefId");`,
  `CREATE INDEX IF NOT EXISTS "signatures_employeeId_signedAt_idx"
     ON "signatures"("employeeId","signedAt");`,
]

console.log(`Applying ${MIGRATION_NAME}…`)
for (let i = 0; i < statements.length; i++) {
  try {
    await prisma.$executeRawUnsafe(statements[i])
    console.log(`  ✓ statement ${i + 1}/${statements.length}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/already exists|duplicate_object/i.test(msg)) {
      console.log(`  ↳ statement ${i + 1} already applied`)
    } else {
      console.error(`  ✗ statement ${i + 1} failed:`, msg)
      throw e
    }
  }
}

const count = await prisma.signature.count().catch(() => null)
console.log('signatures row count →', count)
console.log('✅ Migration applied successfully')

await prisma.$disconnect()
