import type { Prisma } from '@prisma/client'

/** A DTR row (including leave/absence/manual entries) counts as a record.
 * Do not replace this with a clock-in-only filter: it would omit paid leave.
 */
export function payrollEmployeeEligibility(companyId: string, periodStart: Date, periodEnd: Date): Prisma.EmployeeWhereInput {
  return {
    companyId,
    hireDate: { lte: periodEnd },
    OR: [
      { trackTime: false },
      { dtrRecords: { some: { date: { gte: periodStart, lte: periodEnd } } } },
    ],
  }
}
