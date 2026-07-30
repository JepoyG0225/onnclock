/**
 * Helpers for the Cash Advance feature: figure out an employee's monthly
 * equivalent income and the max advance they can request.
 *
 * Why this needs care: Employee.basicSalary stores DIFFERENT semantics
 * depending on rateType:
 *   MONTHLY → already a monthly amount
 *   DAILY   → daily rate (must × DOLE workdays/month to get monthly)
 *   HOURLY  → hourly rate (must × 8 hours × workdays/month)
 *
 * Naively taking 30% of basicSalary works only for MONTHLY employees.
 * For DAILY workers it would produce a meaningless number (e.g. 30% of a
 * ₱500 daily rate = ₱150 max advance instead of the intended ~₱3,300).
 */
import { prisma } from '@/lib/prisma'

const DOLE_WORKDAYS_PER_MONTH = 22
const STANDARD_HOURS_PER_DAY  = 8
export const CASH_ADVANCE_MAX_PERCENTAGE = 0.30   // 30% of monthly income

/**
 * How many payroll cutoffs fall in a month for each pay frequency — matches
 * the periodDivisor used by the payroll engine when it splits a loan's
 * monthly amortization across cutoffs.
 */
export function periodsPerMonth(payFrequency: string | null | undefined): number {
  switch (payFrequency) {
    case 'WEEKLY': return 4
    case 'DAILY':  return 22
    case 'MONTHLY': return 1
    case 'SEMI_MONTHLY':
    default:        return 2
  }
}

/**
 * The peso amount that will actually be deducted from ONE cutoff for a given
 * repayment plan. Single-cutoff repays the whole advance in one deduction;
 * otherwise the monthly amortization (amount / months) is split across the
 * cutoffs in that month.
 */
export function perCutoffDeduction(
  amount: number,
  plan: { singleCutoff?: boolean; repaymentMonths?: number },
  periodsPerMo: number,
): number {
  if (plan.singleCutoff) return parseFloat(amount.toFixed(2))
  const months = Math.max(1, Math.min(3, plan.repaymentMonths ?? 1))
  return parseFloat(((amount / months) / Math.max(1, periodsPerMo)).toFixed(2))
}

export interface MonthlyEquivalentEmployee {
  rateType: 'MONTHLY' | 'DAILY' | 'HOURLY'
  basicSalary: number
  dailyRate?: number | null
  hourlyRate?: number | null
}

/**
 * Convert an employee's stored rate to a monthly equivalent peso amount.
 * Uses the explicit dailyRate / hourlyRate if present, otherwise derives
 * from basicSalary based on rateType.
 */
export function monthlyEquivalent(emp: MonthlyEquivalentEmployee): number {
  if (emp.rateType === 'MONTHLY') {
    return Number(emp.basicSalary)
  }
  if (emp.rateType === 'DAILY') {
    const daily = Number(emp.dailyRate ?? emp.basicSalary)
    return parseFloat((daily * DOLE_WORKDAYS_PER_MONTH).toFixed(2))
  }
  // HOURLY
  const hourly = Number(emp.hourlyRate ?? emp.basicSalary)
  return parseFloat((hourly * STANDARD_HOURS_PER_DAY * DOLE_WORKDAYS_PER_MONTH).toFixed(2))
}

export interface CashAdvanceLimit {
  /** Monthly-equivalent income used as the base */
  monthlyIncome: number
  /** 30% raw cap before subtracting outstanding balance */
  rawCap: number
  /** Sum of remaining balance across the employee's APPROVED+ACTIVE cash-advance loans */
  outstanding: number
  /** Final available room — what the employee can actually request right now */
  available: number
}

/**
 * Compute the per-employee cash advance limit, accounting for outstanding
 * balances on previously-approved cash advances. Cumulative debt against
 * the company never exceeds 30% of monthly income at any point in time.
 */
export async function computeCashAdvanceLimit(
  emp: MonthlyEquivalentEmployee & { id: string },
): Promise<CashAdvanceLimit> {
  const monthlyIncome = monthlyEquivalent(emp)
  const rawCap = parseFloat((monthlyIncome * CASH_ADVANCE_MAX_PERCENTAGE).toFixed(2))

  // Sum the remaining balance on any ACTIVE EmployeeLoan that originated
  // from a cash advance (linkedLoanId is set on the cash advance row).
  let outstanding = 0
  try {
    const loans = await prisma.employeeLoan.findMany({
      where: {
        employeeId: emp.id,
        loanType: 'CASH_ADVANCE',
        status: 'ACTIVE',
      },
      select: { balance: true },
    })
    outstanding = loans.reduce((s, l) => s + Number(l.balance), 0)
  } catch {
    // Schema may not have the cash-advance column on older DBs — treat as 0
    outstanding = 0
  }

  const available = Math.max(0, parseFloat((rawCap - outstanding).toFixed(2)))
  return {
    monthlyIncome,
    rawCap,
    outstanding,
    available,
  }
}
