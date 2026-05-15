/**
 * Helpers for triggering payroll recomputes after data changes.
 *
 * When an employee's compensation fields change (rate, salary, holiday-
 * pay override, mandatory-deduction toggles, etc.) any non-LOCKED /
 * non-APPROVED payroll run that already has a payslip for that employee
 * is now stale — basicPay, deductions and gross may be different.
 *
 * This module:
 *   1. Finds the affected runs
 *   2. Recomputes each one by POSTing back to /api/payroll/[runId]/compute
 *      using the same MIGRATION_APPLY_KEY bypass the admin recompute
 *      proxy uses (no session cookie needed)
 *
 * Failures are swallowed and logged — the calling PATCH must not 500 if
 * the secondary recompute can't reach the network, since the primary
 * employee write already succeeded.
 */
import { prisma } from '@/lib/prisma'

const APPLY_KEY = (process.env.MIGRATION_APPLY_KEY ?? '').trim().replace(/^"|"$/g, '')

/** Which Employee fields, when changed, should re-run payroll for that employee */
export const PAYROLL_AFFECTING_FIELDS = [
  'rateType',
  'basicSalary',
  'dailyRate',
  'hourlyRate',
  'payFrequency',
  'isExemptFromTax',
  'isMinimumWageEarner',
  'disableHolidayPay',
  'trackTime',
  'sssEnabled',
  'philhealthEnabled',
  'pagibigEnabled',
  'withholdingTaxEnabled',
] as const

export type PayrollAffectingField = (typeof PAYROLL_AFFECTING_FIELDS)[number]

/**
 * Compare two employee snapshots and return the list of payroll-affecting
 * fields that differ. Empty array means no recompute needed.
 */
export function diffPayrollAffectingFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): PayrollAffectingField[] {
  const changed: PayrollAffectingField[] = []
  for (const field of PAYROLL_AFFECTING_FIELDS) {
    const a = before[field]
    const b = after[field]
    // Normalize Decimal-like objects to numbers before comparing
    const norm = (v: unknown): unknown =>
      v && typeof v === 'object' && 'toNumber' in v
        ? (v as { toNumber: () => number }).toNumber()
        : v
    if (norm(a) !== norm(b)) changed.push(field)
  }
  return changed
}

/**
 * Find every non-LOCKED / non-APPROVED payroll run that has a payslip
 * for this employee, then call the compute endpoint for each so the
 * payslips reflect the latest employee data. Best-effort, all failures
 * are logged and swallowed.
 */
export async function recomputeRunsForEmployee(
  employeeId: string,
  companyId: string,
  origin: string,
): Promise<{ scheduled: number; succeeded: number; failed: number }> {
  if (!APPLY_KEY) {
    console.warn('[recomputeRunsForEmployee] MIGRATION_APPLY_KEY not set — skipping')
    return { scheduled: 0, succeeded: 0, failed: 0 }
  }

  const runs = await prisma.payrollRun.findMany({
    where: {
      companyId,
      status: { in: ['DRAFT', 'COMPUTED', 'FOR_APPROVAL'] },
      payslips: { some: { employeeId } },
    },
    select: { id: true, companyId: true },
  })

  let succeeded = 0
  let failed = 0

  for (const run of runs) {
    // Replay the previously-saved variable-income entries so the compute
    // route's "all required entries present" validation passes.
    const priorEntries = await prisma.payrollRunIncomeEntry.findMany({
      where: { payrollRunId: run.id },
      select: { employeeId: true, incomeTypeId: true, amount: true },
    })
    const variableIncomeEntries = priorEntries.map((e) => ({
      employeeId: e.employeeId,
      incomeTypeId: e.incomeTypeId,
      amount: Number(e.amount),
    }))

    try {
      const res = await fetch(
        `${origin}/api/payroll/${run.id}/compute` +
        `?companyId=${encodeURIComponent(run.companyId)}` +
        `&adminKey=${encodeURIComponent(APPLY_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variableIncomeEntries }),
        },
      )
      if (res.ok) succeeded++
      else {
        failed++
        console.warn(`[recomputeRunsForEmployee] run ${run.id} returned ${res.status}`)
      }
    } catch (err) {
      failed++
      console.warn(`[recomputeRunsForEmployee] run ${run.id} fetch failed`, err instanceof Error ? err.message : err)
    }
  }

  return { scheduled: runs.length, succeeded, failed }
}
