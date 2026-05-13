/**
 * POST /api/admin/db-apply?key=<MIGRATION_APPLY_KEY>
 *
 * One-shot admin endpoint that applies the
 * 20260513000000_add_notifications_and_assets migration when Vercel's build
 * env can't reach Supabase's direct port. Idempotent — re-running is a no-op
 * because every CREATE uses IF NOT EXISTS.
 *
 * Requires:
 *   1. SUPER_ADMIN role
 *   2. Matching MIGRATION_APPLY_KEY env var passed as ?key=<value>
 *
 * Remove this file after the migration is applied.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const MIGRATION_NAME = '20260513000000_add_notifications_and_assets'

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (ctx.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'SUPER_ADMIN only' }, { status: 403 })
  }
  const key = (req.nextUrl.searchParams.get('key') ?? '').trim()
  const expected = (process.env.MIGRATION_APPLY_KEY ?? '').trim().replace(/^"|"$/g, '')
  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 403 })
  }

  // Idempotent DDL — runs each statement guarded so re-applying is safe.
  const statements: string[] = [
    `DO $$ BEGIN
       CREATE TYPE "NotificationType" AS ENUM (
         'LEAVE_REQUEST_SUBMITTED','LEAVE_REQUEST_APPROVED','LEAVE_REQUEST_REJECTED',
         'DTR_APPROVED','DTR_REJECTED','OT_REQUEST_APPROVED','OT_REQUEST_REJECTED',
         'ANNOUNCEMENT_POSTED','DOCUMENT_EXPIRING','ASSET_ASSIGNED','ASSET_RETURNED',
         'PAYSLIP_RELEASED','GENERIC'
       );
     EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

    `DO $$ BEGIN
       CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE','ASSIGNED','IN_REPAIR','RETIRED','LOST');
     EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

    `DO $$ BEGIN
       CREATE TYPE "AssetAssignmentStatus" AS ENUM ('ACTIVE','RETURNED');
     EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

    `CREATE TABLE IF NOT EXISTS "notifications" (
       "id" TEXT NOT NULL,
       "companyId" TEXT NOT NULL,
       "userId" TEXT NOT NULL,
       "type" "NotificationType" NOT NULL DEFAULT 'GENERIC',
       "title" TEXT NOT NULL,
       "body" TEXT,
       "link" TEXT,
       "isRead" BOOLEAN NOT NULL DEFAULT false,
       "readAt" TIMESTAMP(3),
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
     );`,
    `CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId","isRead","createdAt");`,
    `CREATE INDEX IF NOT EXISTS "notifications_companyId_createdAt_idx" ON "notifications"("companyId","createdAt");`,

    `CREATE TABLE IF NOT EXISTS "company_assets" (
       "id" TEXT NOT NULL,
       "companyId" TEXT NOT NULL,
       "assetTag" TEXT,
       "category" TEXT NOT NULL,
       "name" TEXT NOT NULL,
       "serialNumber" TEXT,
       "purchaseDate" TIMESTAMP(3),
       "purchaseCost" DECIMAL(12,2),
       "warrantyUntil" TIMESTAMP(3),
       "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
       "notes" TEXT,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL,
       CONSTRAINT "company_assets_pkey" PRIMARY KEY ("id"),
       CONSTRAINT "company_assets_companyId_fkey"
         FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
     );`,
    `CREATE INDEX IF NOT EXISTS "company_assets_companyId_status_idx" ON "company_assets"("companyId","status");`,
    `CREATE INDEX IF NOT EXISTS "company_assets_companyId_category_idx" ON "company_assets"("companyId","category");`,

    `CREATE TABLE IF NOT EXISTS "asset_assignments" (
       "id" TEXT NOT NULL,
       "assetId" TEXT NOT NULL,
       "employeeId" TEXT NOT NULL,
       "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "returnedAt" TIMESTAMP(3),
       "conditionAtIssue" TEXT,
       "conditionAtReturn" TEXT,
       "status" "AssetAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
       "assignedById" TEXT,
       "returnedById" TEXT,
       "notes" TEXT,
       CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id"),
       CONSTRAINT "asset_assignments_assetId_fkey"
         FOREIGN KEY ("assetId") REFERENCES "company_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
       CONSTRAINT "asset_assignments_employeeId_fkey"
         FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE
     );`,
    `CREATE INDEX IF NOT EXISTS "asset_assignments_assetId_status_idx" ON "asset_assignments"("assetId","status");`,
    `CREATE INDEX IF NOT EXISTS "asset_assignments_employeeId_status_idx" ON "asset_assignments"("employeeId","status");`,

    // 2026-05-13: add "nightDifferentialIncludesBreak" toggle to payroll config
    `ALTER TABLE "payroll_cycle_configs"
       ADD COLUMN IF NOT EXISTS "nightDifferentialIncludesBreak" BOOLEAN NOT NULL DEFAULT false;`,
  ]

  const results: { stmt: number; ok: boolean; error?: string }[] = []
  for (let i = 0; i < statements.length; i++) {
    try {
      await prisma.$executeRawUnsafe(statements[i])
      results.push({ stmt: i + 1, ok: true })
    } catch (e) {
      results.push({ stmt: i + 1, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // Mark migration as applied in Prisma's tracker (best-effort)
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
      SELECT gen_random_uuid()::text, 'manual', NOW(), '${MIGRATION_NAME}', NOW(), 1
      WHERE NOT EXISTS (
        SELECT 1 FROM _prisma_migrations WHERE migration_name = '${MIGRATION_NAME}'
      );
    `)
  } catch { /* ignore — table may not exist on a fresh DB */ }

  const failed = results.filter((r) => !r.ok)
  return NextResponse.json({
    migration: MIGRATION_NAME,
    statementsRun: statements.length,
    failed: failed.length,
    results,
  }, { status: failed.length === 0 ? 200 : 207 })
}
