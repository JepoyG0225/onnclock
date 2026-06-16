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
      name: 'add_pm_transfer_id_to_disbursement_items',
      sql: `
        ALTER TABLE "payroll_disbursement_items"
          ADD COLUMN IF NOT EXISTS "pm_transfer_id" TEXT;
      `,
    },
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
    {
      name: 'create_approval_workflows',
      sql: `
        CREATE TABLE IF NOT EXISTS "approval_workflows" (
          "id"           TEXT         NOT NULL,
          "companyId"    TEXT         NOT NULL,
          "type"         TEXT         NOT NULL,
          "name"         TEXT         NOT NULL,
          "departmentId" TEXT,
          "isActive"     BOOLEAN      NOT NULL DEFAULT true,
          "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
        );
        CREATE TABLE IF NOT EXISTS "approval_workflow_steps" (
          "id"             TEXT         NOT NULL,
          "workflowId"     TEXT         NOT NULL,
          "order"          INTEGER      NOT NULL,
          "stepType"       TEXT         NOT NULL DEFAULT 'APPROVAL',
          "conditions"     JSONB,
          "approverType"   TEXT,
          "approverUserId" TEXT,
          "approverRole"   TEXT,
          "notifyTarget"   TEXT,
          "notifyUserId"   TEXT,
          "notifyRole"     TEXT,
          "notifyChannel"  TEXT         DEFAULT 'IN_APP',
          "messageTitle"   TEXT,
          "messageBody"    TEXT,
          "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "approval_workflow_steps_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "approval_workflows_companyId_type_idx"
          ON "approval_workflows"("companyId", "type");
        CREATE UNIQUE INDEX IF NOT EXISTS "approval_workflows_companyId_type_departmentId_key"
          ON "approval_workflows"("companyId", "type", "departmentId");
        CREATE INDEX IF NOT EXISTS "approval_workflow_steps_workflowId_idx"
          ON "approval_workflow_steps"("workflowId");
        CREATE UNIQUE INDEX IF NOT EXISTS "approval_workflow_steps_workflowId_order_key"
          ON "approval_workflow_steps"("workflowId", "order");
        DO $$ BEGIN
          ALTER TABLE "approval_workflows"
            ADD CONSTRAINT "approval_workflows_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          ALTER TABLE "approval_workflow_steps"
            ADD CONSTRAINT "approval_workflow_steps_workflowId_fkey"
            FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `,
    },
    {
      name: 'add_approval_columns_to_requests',
      sql: `
        ALTER TABLE "overtime_requests"
          ADD COLUMN IF NOT EXISTS "approvalLevel" INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "approvalTrail" JSONB;
        ALTER TABLE "cash_advance_requests"
          ADD COLUMN IF NOT EXISTS "approvalLevel" INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "approvalTrail" JSONB;
        ALTER TABLE "budget_requisitions"
          ADD COLUMN IF NOT EXISTS "approvalLevel" INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "approvalTrail" JSONB;
        ALTER TABLE "time_entry_corrections"
          ADD COLUMN IF NOT EXISTS "approvalLevel" INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "approvalTrail" JSONB;
      `,
    },
    {
      name: 'create_performance_competencies',
      sql: `
        CREATE TABLE IF NOT EXISTS "performance_competencies" (
          "id"          TEXT         NOT NULL,
          "companyId"   TEXT         NOT NULL,
          "key"         TEXT         NOT NULL,
          "label"       TEXT         NOT NULL,
          "description" TEXT,
          "sortOrder"   INTEGER      NOT NULL DEFAULT 0,
          "isActive"    BOOLEAN      NOT NULL DEFAULT true,
          "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "performance_competencies_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "performance_competencies_companyId_key_key"
          ON "performance_competencies"("companyId", "key");
        CREATE INDEX IF NOT EXISTS "performance_competencies_companyId_isActive_sortOrder_idx"
          ON "performance_competencies"("companyId", "isActive", "sortOrder");
        DO $$ BEGIN
          ALTER TABLE "performance_competencies"
            ADD CONSTRAINT "performance_competencies_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `,
    },
    {
      name: 'create_employee_other_deductions',
      sql: `
        CREATE TABLE IF NOT EXISTS "employee_other_deductions" (
          "id"         TEXT          NOT NULL,
          "employeeId" TEXT          NOT NULL,
          "label"      TEXT          NOT NULL,
          "amount"     DECIMAL(12,2) NOT NULL DEFAULT 0,
          "isActive"   BOOLEAN       NOT NULL DEFAULT true,
          "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "employee_other_deductions_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "employee_other_deductions_employeeId_isActive_idx"
          ON "employee_other_deductions"("employeeId", "isActive");
        DO $$ BEGIN
          ALTER TABLE "employee_other_deductions"
            ADD CONSTRAINT "employee_other_deductions_employeeId_fkey"
            FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
