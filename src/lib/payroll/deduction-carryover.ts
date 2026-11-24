import { payslipTotals } from './payslip-totals'

export type LoanDue = { id: string; type: string; amount: number; label?: string; incoming?: number }
export type DeductionCarryover = {
  version: 1
  loans: (LoanDue & { paid: number; deferred: number })[]
  otherDue: number
  otherPaid: number
  otherDeferred: number
  incomingOther: number
  deferredTotal: number
}
const cents = (n: number) => Math.max(0, Math.round(n * 100))
export function readDeductionCarryover(basis: unknown): DeductionCarryover | null {
  if (!basis || typeof basis !== 'object') return null
  const value = (basis as { deductionCarryover?: DeductionCarryover }).deductionCarryover
  return value?.version === 1 && Array.isArray(value.loans) ? value : null
}

/** Statutory/attendance deductions first, then loans in stable order, then other deductions.
 * All allocation is in cents. Unpaid loans stay in the source loan balance. */
export function allocateDeductions(
  values: Parameters<typeof payslipTotals>[0], loans: LoanDue[], otherDue: number, incomingOther = 0,
) {
  const base = { ...values, sssLoanDeduction: 0, pagibigLoan: 0, companyLoan: 0, otherDeductions: 0 }
  let available = cents(payslipTotals(base).netPay)
  const allocated = loans.map(loan => {
    const due = cents(loan.amount)
    const paid = Math.min(available, due)
    available -= paid
    return { ...loan, amount: due / 100, paid: paid / 100, deferred: (due - paid) / 100 }
  })
  const other = cents(otherDue)
  const otherPaid = Math.min(available, other)
  const sum = (predicate: (l: LoanDue) => boolean) => allocated.filter(predicate).reduce((s, l) => s + cents(l.paid), 0) / 100
  const deductions = {
    sssLoanDeduction: sum(l => l.type.startsWith('SSS')),
    pagibigLoan: sum(l => l.type.startsWith('PAGIBIG')),
    companyLoan: sum(l => !l.type.startsWith('SSS') && !l.type.startsWith('PAGIBIG')),
    otherDeductions: otherPaid / 100,
  }
  const carryover: DeductionCarryover = {
    version: 1, loans: allocated, otherDue: other / 100, otherPaid: otherPaid / 100,
    otherDeferred: (other - otherPaid) / 100, incomingOther,
    deferredTotal: (allocated.reduce((s, l) => s + cents(l.deferred), 0) + other - otherPaid) / 100,
  }
  return { deductions, totals: payslipTotals({ ...base, ...deductions }), carryover }
}
