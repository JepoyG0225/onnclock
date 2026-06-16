/**
 * POST /api/admin/apply-premiums?key=<MIGRATION_APPLY_KEY>
 *
 * One-shot admin endpoint that creates the `payslip_premiums` table when
 * Vercel's build env can't reach Supabase's direct port (so `prisma migrate
 * deploy` is a no-op at build time). Idempotent — every statement is guarded,
 * so re-running is safe.
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

const MIGRATION_NAME = '20260617000000_add_payslip_premiums'

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

  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS "payslip_premiums" (
       "id" TEXT NOT NULL,
       "payslipId" TEXT NOT NULL,
       "category" TEXT NOT NULL,
       "label" TEXT NOT NULL,
       "hours" DECIMAL(8,2) NOT NULL,
       "multiplier" DECIMAL(6,3) NOT NULL,
       "amount" DECIMAL(12,2) NOT NULL,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "payslip_premiums_pkey" PRIMARY KEY ("id")
     );`,
    `CREATE INDEX IF NOT EXISTS "payslip_premiums_payslipId_idx" ON "payslip_premiums"("payslipId");`,
    `DO $$ BEGIN
       ALTER TABLE "payslip_premiums" ADD CONSTRAINT "payslip_premiums_payslipId_fkey"
         FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
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

  // Mark the migration as applied in Prisma's tracker (best-effort).
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
      SELECT gen_random_uuid()::text, 'manual', NOW(), '${MIGRATION_NAME}', NOW(), 1
      WHERE NOT EXISTS (
        SELECT 1 FROM _prisma_migrations WHERE migration_name = '${MIGRATION_NAME}'
      );
    `)
  } catch { /* ignore — tracker table may not exist */ }

  const failed = results.filter((r) => !r.ok)
  return NextResponse.json({
    migration: MIGRATION_NAME,
    statementsRun: statements.length,
    failed: failed.length,
    results,
  }, { status: failed.length === 0 ? 200 : 207 })
}
