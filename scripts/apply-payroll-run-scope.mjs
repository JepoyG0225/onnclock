/**
 * Add per-run scoping fields to payroll_runs:
 *   - payGroupLabel        — optional human-readable label for grouping runs
 *                            (e.g. "Probationary cycle", "Project XYZ")
 *   - employeeScopeMode    — "ALL" (default) | "EMPLOYMENT_TYPE" | "CUSTOM"
 *   - employmentTypeFilter — list of employment types when mode is EMPLOYMENT_TYPE
 *   - employeeIds          — explicit employee allowlist when mode is CUSTOM
 *
 * employeeIds + employmentTypeFilter are stored as Postgres TEXT[] arrays —
 * keeps Prisma's String[] mapping straightforward and lets us add a GIN
 * index later if filter-by-employee becomes a hot path.
 *
 *   node scripts/apply-payroll-run-scope.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "payroll_runs"
      ADD COLUMN IF NOT EXISTS "payGroupLabel"        TEXT,
      ADD COLUMN IF NOT EXISTS "employeeScopeMode"    TEXT NOT NULL DEFAULT 'ALL',
      ADD COLUMN IF NOT EXISTS "employmentTypeFilter" TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "employeeIds"          TEXT[] NOT NULL DEFAULT '{}';
  `)
  console.log('✓ payroll_runs columns added (or already present)')
} catch (e) {
  console.error('Failed:', e instanceof Error ? e.message : e)
  process.exit(1)
}
await prisma.$disconnect()
