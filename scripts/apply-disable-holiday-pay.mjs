/**
 * Add the disableHolidayPay column to employees.
 *
 *   node scripts/apply-disable-holiday-pay.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "disableHolidayPay" BOOLEAN NOT NULL DEFAULT false;
  `)
  console.log('✓ disableHolidayPay column added (or already present)')
} catch (e) {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exit(1)
}
await prisma.$disconnect()
