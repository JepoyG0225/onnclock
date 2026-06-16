/**
 * Add the disableLateDeductions column to payroll_cycle_configs.
 * Idempotent — uses IF NOT EXISTS.
 *
 *   node scripts/apply-disable-late-deductions.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "payroll_cycle_configs"
      ADD COLUMN IF NOT EXISTS "disableLateDeductions" BOOLEAN NOT NULL DEFAULT false;
  `)
  console.log('✓ disableLateDeductions column added (or already present)')
} catch (e) {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exit(1)
}

await prisma.$disconnect()
