/**
 * Apply the biometric-terminal migration directly to prod.
 * Idempotent — every CREATE / ALTER uses IF NOT EXISTS.
 *
 *   node scripts/apply-biometric-migration.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const MIGRATION_NAME = '20260514180000_biometric_terminal'

const statements = [
  // 1. Status enum for biometric devices
  `DO $$ BEGIN
     CREATE TYPE "BiometricDeviceStatus" AS ENUM ('PENDING_PAIRING','ACTIVE','DISABLED','REVOKED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // 2. Event type enum
  `DO $$ BEGIN
     CREATE TYPE "BiometricEventType" AS ENUM ('CLOCK_IN','CLOCK_OUT','BREAK_IN','BREAK_OUT','ENROLL','FAIL_NO_MATCH');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // 3. biometric_devices table
  `CREATE TABLE IF NOT EXISTS "biometric_devices" (
     "id"               TEXT NOT NULL,
     "companyId"        TEXT NOT NULL,
     "name"             TEXT NOT NULL,
     "serialNumber"     TEXT,
     "pairCode"         TEXT,
     "pairCodeExpiresAt" TIMESTAMP(3),
     "tokenHash"        TEXT,
     "pairedAt"         TIMESTAMP(3),
     "lastSeenAt"       TIMESTAMP(3),
     "status"           "BiometricDeviceStatus" NOT NULL DEFAULT 'PENDING_PAIRING',
     "location"         TEXT,
     "ipAddress"        TEXT,
     "firmwareVersion"  TEXT,
     "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt"        TIMESTAMP(3) NOT NULL,
     "createdByUserId"  TEXT,
     CONSTRAINT "biometric_devices_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "biometric_devices_companyId_fkey"
       FOREIGN KEY ("companyId") REFERENCES "companies"("id")
       ON DELETE CASCADE ON UPDATE CASCADE
   );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "biometric_devices_serialNumber_key" ON "biometric_devices"("serialNumber");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "biometric_devices_pairCode_key"     ON "biometric_devices"("pairCode");`,
  `CREATE INDEX IF NOT EXISTS "biometric_devices_companyId_status_idx"    ON "biometric_devices"("companyId","status");`,
  `CREATE INDEX IF NOT EXISTS "biometric_devices_companyId_lastSeenAt_idx" ON "biometric_devices"("companyId","lastSeenAt");`,

  // 4. fingerprint_enrollments
  `CREATE TABLE IF NOT EXISTS "fingerprint_enrollments" (
     "id"                 TEXT NOT NULL,
     "companyId"          TEXT NOT NULL,
     "employeeId"         TEXT NOT NULL,
     "finger"             TEXT NOT NULL,
     "templateB64"        TEXT NOT NULL,
     "qualityScore"       INTEGER,
     "enrolledAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "enrolledByDeviceId" TEXT,
     "enrolledByUserId"   TEXT,
     CONSTRAINT "fingerprint_enrollments_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "fingerprint_enrollments_employeeId_fkey"
       FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
       ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT "fingerprint_enrollments_enrolledByDeviceId_fkey"
       FOREIGN KEY ("enrolledByDeviceId") REFERENCES "biometric_devices"("id")
       ON DELETE SET NULL ON UPDATE CASCADE
   );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "fingerprint_enrollments_employeeId_finger_key"
     ON "fingerprint_enrollments"("employeeId","finger");`,
  `CREATE INDEX IF NOT EXISTS "fingerprint_enrollments_companyId_idx"
     ON "fingerprint_enrollments"("companyId");`,

  // 5. biometric_clock_events
  `CREATE TABLE IF NOT EXISTS "biometric_clock_events" (
     "id"          TEXT NOT NULL,
     "deviceId"    TEXT NOT NULL,
     "companyId"   TEXT NOT NULL,
     "employeeId"  TEXT,
     "eventType"   "BiometricEventType" NOT NULL,
     "matchScore"  INTEGER,
     "capturedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "syncedAt"    TIMESTAMP(3),
     "dtrRecordId" TEXT,
     "notes"       TEXT,
     CONSTRAINT "biometric_clock_events_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "biometric_clock_events_deviceId_fkey"
       FOREIGN KEY ("deviceId") REFERENCES "biometric_devices"("id")
       ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT "biometric_clock_events_employeeId_fkey"
       FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
       ON DELETE SET NULL ON UPDATE CASCADE
   );`,
  `CREATE INDEX IF NOT EXISTS "biometric_clock_events_companyId_capturedAt_idx"
     ON "biometric_clock_events"("companyId","capturedAt");`,
  `CREATE INDEX IF NOT EXISTS "biometric_clock_events_deviceId_capturedAt_idx"
     ON "biometric_clock_events"("deviceId","capturedAt");`,
  `CREATE INDEX IF NOT EXISTS "biometric_clock_events_employeeId_capturedAt_idx"
     ON "biometric_clock_events"("employeeId","capturedAt");`,
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

const counts = {
  devices:     await prisma.biometricDevice.count().catch(() => 'n/a'),
  enrollments: await prisma.fingerprintEnrollment.count().catch(() => 'n/a'),
  events:      await prisma.biometricClockEvent.count().catch(() => 'n/a'),
}
console.log('Row counts →', counts)
console.log('✅ Migration applied successfully')

await prisma.$disconnect()
