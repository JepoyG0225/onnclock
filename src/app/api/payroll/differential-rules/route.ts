import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  regularOtRate: z.coerce.number().min(0).max(10),
  restDayOtRate: z.coerce.number().min(0).max(10),
  regularHolidayOtRate: z.coerce.number().min(0).max(10),
  specialHolidayOtRate: z.coerce.number().min(0).max(10),
  nightDifferentialRate: z.coerce.number().min(0).max(1),
})

const DEFAULT_RULES = {
  regularOtRate: 1.25,
  restDayOtRate: 1.69,
  regularHolidayOtRate: 2.6,
  specialHolidayOtRate: 1.69,
  nightDifferentialRate: 0.1,
}

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "payroll_differential_configs" (
      "companyId" TEXT PRIMARY KEY,
      "regularOtRate" DECIMAL(6,4) NOT NULL DEFAULT 1.2500,
      "restDayOtRate" DECIMAL(6,4) NOT NULL DEFAULT 1.6900,
      "regularHolidayOtRate" DECIMAL(6,4) NOT NULL DEFAULT 2.6000,
      "specialHolidayOtRate" DECIMAL(6,4) NOT NULL DEFAULT 1.6900,
      "nightDifferentialRate" DECIMAL(6,4) NOT NULL DEFAULT 0.1000,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)
}

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  try {
    await ensureTable()
    const rows = await prisma.$queryRaw<Array<{
      regularOtRate: number | { toNumber(): number }
      restDayOtRate: number | { toNumber(): number }
      regularHolidayOtRate: number | { toNumber(): number }
      specialHolidayOtRate: number | { toNumber(): number }
      nightDifferentialRate: number | { toNumber(): number }
    }>>`
      SELECT
        "regularOtRate",
        "restDayOtRate",
        "regularHolidayOtRate",
        "specialHolidayOtRate",
        "nightDifferentialRate"
      FROM "payroll_differential_configs"
      WHERE "companyId" = ${ctx.companyId}
      LIMIT 1
    `
    const row = rows[0]
    if (!row) return NextResponse.json({ rules: DEFAULT_RULES })
    const toNum = (value: number | { toNumber(): number }) =>
      typeof value === 'object' ? value.toNumber() : Number(value)
    return NextResponse.json({
      rules: {
        regularOtRate: toNum(row.regularOtRate),
        restDayOtRate: toNum(row.restDayOtRate),
        regularHolidayOtRate: toNum(row.regularHolidayOtRate),
        specialHolidayOtRate: toNum(row.specialHolidayOtRate),
        nightDifferentialRate: toNum(row.nightDifferentialRate),
      },
    })
  } catch {
    return NextResponse.json({ rules: DEFAULT_RULES })
  }
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'])
  if (error) return error

  const raw = await req.json().catch(() => null)
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    await ensureTable()
    const rules = parsed.data
    await prisma.$executeRaw`
      INSERT INTO "payroll_differential_configs" (
        "companyId", "regularOtRate", "restDayOtRate", "regularHolidayOtRate", "specialHolidayOtRate", "nightDifferentialRate", "updatedAt"
      ) VALUES (
        ${ctx.companyId}, ${rules.regularOtRate}, ${rules.restDayOtRate}, ${rules.regularHolidayOtRate}, ${rules.specialHolidayOtRate}, ${rules.nightDifferentialRate}, NOW()
      )
      ON CONFLICT ("companyId")
      DO UPDATE SET
        "regularOtRate" = EXCLUDED."regularOtRate",
        "restDayOtRate" = EXCLUDED."restDayOtRate",
        "regularHolidayOtRate" = EXCLUDED."regularHolidayOtRate",
        "specialHolidayOtRate" = EXCLUDED."specialHolidayOtRate",
        "nightDifferentialRate" = EXCLUDED."nightDifferentialRate",
        "updatedAt" = NOW()
    `
    return NextResponse.json({ ok: true, rules })
  } catch (errorMessage) {
    return NextResponse.json({ error: 'Failed to save differential rules', detail: String(errorMessage) }, { status: 500 })
  }
}
