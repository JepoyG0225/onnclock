import { Prisma } from '@prisma/client'

/** Round installments up to cents; cap the final installment to the exact balance. */
export function monthlyRepayment(amount: number, months: number, cutoffs?: number, divisor = 1): number {
  const monthly = cutoffs && divisor === 52 / 12 ? new Prisma.Decimal(amount).mul(52).div(12) : new Prisma.Decimal(amount).mul(cutoffs ? divisor : 1)
  return monthly.div(cutoffs || months).toDecimalPlaces(2, Prisma.Decimal.ROUND_CEIL).toNumber()
}

export function loanInstallment(monthly: number, divisor: number, balance: number): number {
  const installment = divisor === 52 / 12 ? new Prisma.Decimal(monthly).mul(12).div(52) : new Prisma.Decimal(monthly).div(divisor)
  return Math.min(installment.toDecimalPlaces(2, Prisma.Decimal.ROUND_CEIL).toNumber(), balance)
}
