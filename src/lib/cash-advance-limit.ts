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
