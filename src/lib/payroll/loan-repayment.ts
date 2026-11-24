import { Prisma } from '@prisma/client'

/** Round installments up to cents; cap the final installment to the exact balance. */
export function monthlyRepayment(amount: number, months: number, cutoffs?: number, divisor = 1): number {
  return new Prisma.Decimal(amount).mul(cutoffs ? divisor : 1).div(cutoffs || months).toDecimalPlaces(2, Prisma.Decimal.ROUND_CEIL).toNumber()
}

export function loanInstallment(monthly: number, divisor: number, balance: number): number {
  return Math.min(new Prisma.Decimal(monthly).div(divisor).toDecimalPlaces(2, Prisma.Decimal.ROUND_CEIL).toNumber(), balance)
}
