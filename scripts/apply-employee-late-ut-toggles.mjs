/**
 * Add per-employee late + undertime deduction toggles. Mirrors the
 * existing per-employee `disableHolidayPay` flag pattern.
 *
 * Default false (deductions on) so behavior is unchanged for existing
 * employees. HR sets the toggle to TRUE on a per-employee basis to
 * suppress the pay docking — useful for HOURLY/DAILY rate hires where
 * the basic pay already pro-rates by actual hours, so deducting late/UT
 * on top would double-count.
 *
 *   node scripts/apply-employee-late-ut-toggles.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "disableLateDeduction"       BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "disableUndertimeDeduction"  BOOLEAN NOT NULL DEFAULT false;
  `)
  console.log('✓ employees.disableLateDeduction / disableUndertimeDeduction added')
} catch (e) {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exit(1)
}
await prisma.$disconnect()
