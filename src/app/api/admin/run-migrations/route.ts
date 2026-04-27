/**
 * One-time idempotent migration runner.
 * Protected by SUPER_ADMIN. Safe to run multiple times.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (ctx.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  }

  const results: Array<{ name: string; status: string; error?: string }> = []

  const migrations = [
    {
      name: 'add_schedule_repeat_cycle',
      sql: `
        ALTER TABLE "work_schedules"
          ADD COLUMN IF NOT EXISTS "repeatCycle"    TEXT NOT NULL DEFAULT 'WEEKLY',
          ADD COLUMN IF NOT EXISTS "cycleWeeks"     JSONB,
          ADD COLUMN IF NOT EXISTS "cycleStartDate" TIMESTAMP(3);
      `,
    },
    {
      name: 'create_employee_shift_assignments',
      sql: `
        CREATE TABLE IF NOT EXISTS "employee_shift_assignments" (
          "id"         TEXT         NOT NULL,
          "companyId"  TEXT         NOT NULL,
          "employeeId" TEXT         NOT NULL,
          "date"       DATE         NOT NULL,
          "scheduleId" TEXT,
          "timeIn"     TEXT,
          "timeOut"    TEXT,
          "isRestDay"  BOOLEAN      NOT NULL DEFAULT false,
          "notes"      TEXT,
          "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "employee_shift_assignments_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "employee_shift_assignments_emp_date_key"
          ON "employee_shift_assignments"("employeeId", "date");
        CREATE INDEX IF NOT EXISTS "employee_shift_assignments_company_date_idx"
          ON "employee_shift_assignments"("companyId", "date");
      `,
    },
    {
      name: 'add_esa_foreign_keys',
      sql: `
        DO $$ BEGIN
          ALTER TABLE "employee_shift_assignments"
            ADD CONSTRAINT "esa_company_fkey"
            FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          ALTER TABLE "employee_shift_assignments"
            ADD CONSTRAINT "esa_employee_fkey"
            FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          ALTER TABLE "employee_shift_assignments"
            ADD CONSTRAINT "esa_schedule_fkey"
            FOREIGN KEY ("scheduleId") REFERENCES "work_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `,
    },
  ]

  for (const m of migrations) {
    try {
      await prisma.$executeRawUnsafe(m.sql)
      results.push({ name: m.name, status: 'ok' })
    } catch (err) {
      results.push({ name: m.name, status: 'error', error: String(err) })
    }
  }

  return NextResponse.json({ ok: true, results })
}
