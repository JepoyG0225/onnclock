import { prisma } from '@/lib/prisma'

/**
 * How many pay periods ("cutoffs") a month is split into.
 *
 * This is the same table payroll compute uses when it splits a loan's monthly
 * amortisation across cutoffs:
 *   periodAmount = monthlyAmortization / periodDivisor
 * It lives here so the request forms can work backwards from a desired
 * per-cutoff deduction without duplicating the constants.
 */
export const PERIOD_DIVISOR: Record<string, number> = {
  MONTHLY: 1,
  SEMI_MONTHLY: 2,
  WEEKLY: 4,
  DAILY: 22,
}

export function periodDivisorFor(payFrequency: string | null | undefined): number {
  return PERIOD_DIVISOR[payFrequency ?? 'SEMI_MONTHLY'] ?? 2
}

/**
 * The company's cutoffs-per-month. Defaults to semi-monthly (2), which is both
 * the schema default and overwhelmingly the PH norm, so a company with no
 * PayrollCycleConfig row still behaves sensibly.
 */
export async function getPeriodDivisor(companyId: string): Promise<number> {
  try {
    const cfg = await prisma.payrollCycleConfig.findUnique({
      where: { companyId },
      select: { payFrequency: true },
    })
    return periodDivisorFor(cfg?.payFrequency)
  } catch {
    return 2
  }
}

/**
 * Monthly amortisation that makes payroll deduct the whole amount in ONE cutoff.
 *
 * Payroll divides the monthly figure by the cutoff count and then caps it at the
 * remaining balance, so storing amount x divisor yields exactly `amount` in the
 * first cutoff and nothing after. This is why "1 cutoff" needs no special case
 * in the payroll engine.
 */
export function oneCutoffAmortization(amount: number, periodDivisor: number): number {
  return Math.round(amount * periodDivisor * 100) / 100
}
