/**
 * Year-end income tax annualization (BIR Revenue Regulation No. 2-98).
 *
 * For each employee, sum all payslips whose pay date falls within the
 * calendar year, recompute the annual income tax against the TRAIN-Law
 * bracket table, and compare against the tax already withheld throughout
 * the year. The difference is either a refund owed back to the employee
 * (if over-withheld) or an additional withholding to deduct on the last
 * pay run of the year (if under-withheld).
 *
 * Used to drive both:
 *   1. The HR "Tax Annualization" review page (Pro-only)
 *   2. The BIR 2316 form rows
 *
 * Note: the engine already uses the annualized-withholding method on each
 * pay run, so most employees will land near zero variance — this helper
 * surfaces the residual.
 */
import { prisma } from '@/lib/prisma'
import { computeAnnualTax } from './bir'

export interface AnnualizationRow {
  employeeId: string
  employeeNo: string
  firstName: string
  lastName: string
  middleName: string | null
  department: string | null
  isMinimumWageEarner: boolean
  isExemptFromTax: boolean
  basicSalary: number
  // Annual aggregates (calendar-year, by pay date)
  payslipCount: number
  totalGross: number
  totalBasic: number
  totalTaxable: number
  totalNonTaxable: number
  totalSss: number
  totalPhilhealth: number
  totalPagibig: number
  totalThirteenth: number
  totalDeMinimis: number
  totalOvertime: number
  totalHoliday: number
  totalNightDiff: number
  totalTaxWithheld: number
  // Annualization result
  annualTaxableIncome: number
  annualTaxDue: number
  // Positive = refund owed to employee; Negative = additional withholding owed
  refundOrAdditional: number
}

export interface AnnualizationSummary {
  year: number
  employeeCount: number
  totalGross: number
  totalTaxWithheld: number
  totalTaxDue: number
  totalRefund: number      // sum of positive refundOrAdditional values
  totalAdditional: number  // absolute sum of negative refundOrAdditional values
  rows: AnnualizationRow[]
}

/**
 * Compute annualization for every active+resigned employee in a company
 * for the given calendar year.
 */
export async function annualizeCompanyForYear(
  companyId: string,
  year: number,
): Promise<AnnualizationSummary> {
  const yearStart = new Date(year, 0, 1)
  const yearEnd   = new Date(year, 11, 31, 23, 59, 59)

  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: {
      id: true,
      employeeNo: true,
      firstName: true,
      lastName: true,
      middleName: true,
      isMinimumWageEarner: true,
      isExemptFromTax: true,
      basicSalary: true,
      department: { select: { name: true } },
      payslips: {
        where: {
          payrollRun: { payDate: { gte: yearStart, lte: yearEnd } },
        },
        select: {
          grossPay: true,
          basicSalary: true,
          taxableIncome: true,
          nonTaxableIncome: true,
          withholdingTax: true,
          sssEmployee: true,
          philhealthEmployee: true,
          pagibigEmployee: true,
          holidayPayAmount: true,
          regularOtAmount: true,
          restDayOtAmount: true,
          holidayOtAmount: true,
          nightDiffAmount: true,
          thirteenthMonthContribution: true,
          riceAllowance: true,
          clothingAllowance: true,
          medicalAllowance: true,
          otherAllowances: true,
        },
      },
    },
  })

  const rows: AnnualizationRow[] = employees
    .filter((e) => e.payslips.length > 0)
    .map((e) => {
      const totals = e.payslips.reduce(
        (acc, p) => {
          acc.gross       += p.grossPay.toNumber()
          acc.basic       += p.basicSalary.toNumber()
          acc.taxable     += p.taxableIncome.toNumber()
          acc.nonTaxable  += p.nonTaxableIncome.toNumber()
          acc.tax         += p.withholdingTax.toNumber()
          acc.sss         += p.sssEmployee.toNumber()
          acc.ph          += p.philhealthEmployee.toNumber()
          acc.pagibig     += p.pagibigEmployee.toNumber()
          acc.holiday     += p.holidayPayAmount.toNumber()
          acc.ot          += p.regularOtAmount.toNumber() + p.restDayOtAmount.toNumber() + p.holidayOtAmount.toNumber()
          acc.nd          += p.nightDiffAmount.toNumber()
          acc.thirteenth  += p.thirteenthMonthContribution.toNumber()
          acc.deMinimis   += p.riceAllowance.toNumber() + p.clothingAllowance.toNumber() + p.medicalAllowance.toNumber() + p.otherAllowances.toNumber()
          return acc
        },
        { gross: 0, basic: 0, taxable: 0, nonTaxable: 0, tax: 0, sss: 0, ph: 0, pagibig: 0, holiday: 0, ot: 0, nd: 0, thirteenth: 0, deMinimis: 0 },
      )

      // 13th-month: first ₱90,000 non-taxable, excess is taxable.
      const thirteenthNonTax  = Math.min(totals.thirteenth, 90_000)
      const thirteenthTaxable = Math.max(0, totals.thirteenth - 90_000)

      // Annual taxable = payslip-period taxable + any taxable excess of 13th month
      const annualTaxableIncome = parseFloat((totals.taxable + thirteenthTaxable).toFixed(2))

      // MWE & tax-exempt employees: zero tax due regardless of bracket
      const annualTaxDue = (e.isMinimumWageEarner || e.isExemptFromTax)
        ? 0
        : computeAnnualTax(annualTaxableIncome)

      // Positive = employee gets a refund; negative = additional withholding required
      const refundOrAdditional = parseFloat((totals.tax - annualTaxDue).toFixed(2))

      return {
        employeeId:       e.id,
        employeeNo:       e.employeeNo,
        firstName:        e.firstName,
        lastName:         e.lastName,
        middleName:       e.middleName,
        department:       e.department?.name ?? null,
        isMinimumWageEarner: e.isMinimumWageEarner,
        isExemptFromTax:  e.isExemptFromTax,
        basicSalary:      Number(e.basicSalary),
        payslipCount:     e.payslips.length,
        totalGross:       parseFloat(totals.gross.toFixed(2)),
        totalBasic:       parseFloat(totals.basic.toFixed(2)),
        totalTaxable:     parseFloat(totals.taxable.toFixed(2)),
        totalNonTaxable:  parseFloat((totals.nonTaxable + thirteenthNonTax).toFixed(2)),
        totalSss:         parseFloat(totals.sss.toFixed(2)),
        totalPhilhealth:  parseFloat(totals.ph.toFixed(2)),
        totalPagibig:     parseFloat(totals.pagibig.toFixed(2)),
        totalThirteenth:  parseFloat(totals.thirteenth.toFixed(2)),
        totalDeMinimis:   parseFloat(totals.deMinimis.toFixed(2)),
        totalOvertime:    parseFloat(totals.ot.toFixed(2)),
        totalHoliday:     parseFloat(totals.holiday.toFixed(2)),
        totalNightDiff:   parseFloat(totals.nd.toFixed(2)),
        totalTaxWithheld: parseFloat(totals.tax.toFixed(2)),
        annualTaxableIncome,
        annualTaxDue,
        refundOrAdditional,
      }
    })
    .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`))

  const summary: AnnualizationSummary = {
    year,
    employeeCount:   rows.length,
    totalGross:      parseFloat(rows.reduce((s, r) => s + r.totalGross, 0).toFixed(2)),
    totalTaxWithheld: parseFloat(rows.reduce((s, r) => s + r.totalTaxWithheld, 0).toFixed(2)),
    totalTaxDue:     parseFloat(rows.reduce((s, r) => s + r.annualTaxDue, 0).toFixed(2)),
    totalRefund:     parseFloat(rows.filter(r => r.refundOrAdditional > 0)
                                    .reduce((s, r) => s + r.refundOrAdditional, 0).toFixed(2)),
    totalAdditional: parseFloat(rows.filter(r => r.refundOrAdditional < 0)
                                    .reduce((s, r) => s + Math.abs(r.refundOrAdditional), 0).toFixed(2)),
    rows,
  }

  return summary
}
