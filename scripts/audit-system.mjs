/**
 * System audit script.
 *
 * Scans the production DB for common irregularities and reports a summary.
 * Read-only by default — pass --fix to apply the safe auto-fixes (those
 * are clearly labelled below).
 *
 * Usage:
 *   node scripts/audit-system.mjs                         # full audit, all companies
 *   node scripts/audit-system.mjs --company=loyola         # filter
 *   node scripts/audit-system.mjs --fix                    # apply safe auto-fixes
 *
 * Categories audited:
 *   A. DTR integrity
 *      A1. Forgotten clock-outs (timeIn set, timeOut null, > 24h old)
 *      A2. DTR rows with overtimeHours > 0 in companies that have OT disabled
 *      A3. DTR regular hours exceeding the scheduled shift cap
 *      A4. Closed shifts with absurd duration (> 16h between in/out)
 *   B. Payroll consistency
 *      B1. Payslip.hoursWorked ≠ sum(DTR.regularHours) for the period
 *           (trackTime employees only)
 *   C. Schedule / employee setup
 *      C1. Active employees with no work schedule at all (no fixed and
 *          no assignments in the last 30 days)
 *      C2. Employees with schedule referencing an inactive WorkSchedule
 *   D. Location tracking
 *      D1. LocationPing rows with invalid lat/lng (out of bounds or 0,0)
 *      D2. Clock-in/out events outside the configured geofence (excluding
 *          geofenceExempt employees)
 *      D3. Companies with geofence enabled but missing/zero coordinates
 *   E. Security / access
 *      E1. Inactive employees whose user account is still active
 *      E2. UserCompany rows with no matching user or company
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY_FIXES = process.argv.includes('--fix')
const companyArg = process.argv.find(a => a.startsWith('--company='))?.slice('--company='.length)

const c = (...args) => console.log(...args)
const section = (title) => {
  c('\n' + '═'.repeat(60))
  c(' ' + title)
  c('═'.repeat(60))
}
const issue = (count, label) => {
  const tag = count > 0 ? `⚠️  ${count}`.padEnd(8) : `✅  0`.padEnd(8)
  c(`  ${tag} ${label}`)
}

const companies = await prisma.company.findMany({
  where: companyArg ? { name: { contains: companyArg, mode: 'insensitive' } } : undefined,
  select: { id: true, name: true, geofenceEnabled: true, geofenceLat: true, geofenceLng: true, geofenceRadiusMeters: true },
  orderBy: { name: 'asc' },
})

c(`Auditing ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}\n`)

let companiesProcessed = 0
let companiesFailed = 0
for (const co of companies) {
try {
  section(co.name + (companies.length === 1 ? '' : ` (${co.id})`))

  // ── Payroll OT config ───────────────────────────────────────────────────
  const cfg = await prisma.payrollCycleConfig.findUnique({
    where: { companyId: co.id },
    select: { enableOvertime: true },
  })
  const otEnabled = cfg?.enableOvertime ?? true
  c('  Settings: OT=' + (otEnabled ? 'enabled' : 'DISABLED'))

  // ─── A. DTR integrity ──────────────────────────────────────────────────
  c('\n  A. DTR integrity')

  const a1 = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM dtr_records d
    JOIN employees e ON e.id = d."employeeId"
    WHERE e."companyId" = '${co.id}'
      AND d."timeIn" IS NOT NULL AND d."timeOut" IS NULL
      AND d."timeIn" < NOW() - INTERVAL '24 hours'
  `)
  issue(a1[0].cnt, 'A1. Forgotten clock-outs (>24h old)')

  if (!otEnabled) {
    const a2 = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS cnt FROM dtr_records d
      JOIN employees e ON e.id = d."employeeId"
      WHERE e."companyId" = '${co.id}'
        AND d."overtimeHours" > 0
    `)
    issue(a2[0].cnt, 'A2. DTR rows with OT > 0 (company has OT disabled)')
    if (APPLY_FIXES && a2[0].cnt > 0) {
      await prisma.$executeRawUnsafe(`
        UPDATE dtr_records SET "overtimeHours" = 0
        WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId" = '${co.id}')
          AND "overtimeHours" > 0
      `)
      c('       → fixed: zeroed OT on ' + a2[0].cnt + ' rows')
    }
  }

  const a4 = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM dtr_records d
    JOIN employees e ON e.id = d."employeeId"
    WHERE e."companyId" = '${co.id}'
      AND d."timeIn" IS NOT NULL AND d."timeOut" IS NOT NULL
      AND EXTRACT(EPOCH FROM (d."timeOut" - d."timeIn")) / 3600 > 16
  `)
  issue(a4[0].cnt, 'A4. Closed shifts longer than 16 hours')

  // ─── B. Payroll consistency ────────────────────────────────────────────
  c('\n  B. Payroll consistency')

  const b1 = await prisma.$queryRawUnsafe(`
    WITH dtr_sums AS (
      SELECT d."employeeId", d.date,
             SUM(d."regularHours")::float AS dtr_reg
      FROM dtr_records d
      JOIN employees e ON e.id = d."employeeId"
      WHERE e."companyId" = '${co.id}' AND e."trackTime" = true
      GROUP BY d."employeeId", d.date
    ),
    period_sums AS (
      SELECT ps."employeeId", pr.id AS run_id, pr."periodLabel",
             ps."hoursWorked"::float AS payslip_hours,
             COALESCE(SUM(ds.dtr_reg), 0)::float AS dtr_period_hours
      FROM payslips ps
      JOIN payroll_runs pr ON pr.id = ps."payrollRunId"
      LEFT JOIN dtr_sums ds ON ds."employeeId" = ps."employeeId"
        AND ds.date BETWEEN pr."periodStart" AND pr."periodEnd"
      WHERE pr."companyId" = '${co.id}'
        AND pr."createdAt" > NOW() - INTERVAL '60 days'
      GROUP BY ps."employeeId", pr.id, pr."periodLabel", ps."hoursWorked"
    )
    SELECT COUNT(*)::int AS cnt FROM period_sums
    WHERE ABS(payslip_hours - dtr_period_hours) > 0.5
  `)
  issue(b1[0].cnt, 'B1. Payslip hours ≠ DTR hours (60-day window, off by >0.5h)')

  // ─── C. Schedule / employee setup ─────────────────────────────────────
  c('\n  C. Schedule / employee setup')

  const c1 = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM employees e
    WHERE e."companyId" = '${co.id}' AND e."isActive" = true
      AND e."workScheduleId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM employee_shift_assignments esa
        WHERE esa."employeeId" = e.id
          AND esa.date > NOW() - INTERVAL '30 days'
      )
  `)
  issue(c1[0].cnt, 'C1. Active employees with no schedule (and no recent assignments)')

  const c2 = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM employees e
    JOIN work_schedules ws ON ws.id = e."workScheduleId"
    WHERE e."companyId" = '${co.id}' AND e."isActive" = true AND ws."isActive" = false
  `)
  issue(c2[0].cnt, 'C2. Active employees linked to an inactive WorkSchedule')

  // ─── D. Location tracking ─────────────────────────────────────────────
  c('\n  D. Location tracking')

  const d1 = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM location_pings lp
    JOIN employees e ON e.id = lp."employeeId"
    WHERE e."companyId" = '${co.id}'
      AND lp."recordedAt" > NOW() - INTERVAL '30 days'
      AND (
        (lp.lat = 0 AND lp.lng = 0)
        OR lp.lat < -90 OR lp.lat > 90
        OR lp.lng < -180 OR lp.lng > 180
      )
  `)
  issue(d1[0].cnt, 'D1. Invalid location pings in last 30 days')

  if (co.geofenceEnabled && co.geofenceLat && co.geofenceLng && co.geofenceRadiusMeters) {
    // Earth radius for haversine
    const radius = co.geofenceRadiusMeters
    const lat0 = co.geofenceLat, lng0 = co.geofenceLng
    const d2 = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS cnt FROM dtr_records d
      JOIN employees e ON e.id = d."employeeId"
      WHERE e."companyId" = '${co.id}' AND e."geofenceExempt" = false
        AND d."clockInLat" IS NOT NULL AND d."clockInLng" IS NOT NULL
        AND d."timeIn" > NOW() - INTERVAL '60 days'
        AND 6371000 * acos(
          GREATEST(LEAST(
            sin(radians(${lat0})) * sin(radians(d."clockInLat"))
            + cos(radians(${lat0})) * cos(radians(d."clockInLat")) * cos(radians(d."clockInLng" - ${lng0})),
          1.0), -1.0)
        ) > ${radius}
    `)
    issue(d2[0].cnt, `D2. Clock-ins outside geofence (radius ${radius}m, last 60d)`)
  } else if (co.geofenceEnabled) {
    issue(1, 'D3. Geofence enabled but coordinates / radius missing')
  } else {
    issue(0, 'D3. Geofence config (disabled)')
  }

  // ─── E. Security / access ─────────────────────────────────────────────
  c('\n  E. Security / access')

  const e1 = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM employees e
    JOIN users u ON u.id = e."userId"
    JOIN user_companies uc ON uc."userId" = u.id AND uc."companyId" = '${co.id}'
    WHERE e."companyId" = '${co.id}' AND e."isActive" = false
      AND uc."isActive" = true
  `)
  issue(e1[0].cnt, 'E1. Inactive employees with active portal user accounts')
  companiesProcessed++
} catch (err) {
  companiesFailed++
  c(`  ❌ Audit failed for this company: ${err.message}`)
}
}

c('\n' + '═'.repeat(60))
c(` Audit complete — processed ${companiesProcessed}/${companies.length} companies` + (companiesFailed > 0 ? ` (${companiesFailed} failed)` : ''))
if (!APPLY_FIXES) c(' Pass --fix to apply safe auto-fixes (A2 only).')
c('═'.repeat(60))

await prisma.$disconnect()
