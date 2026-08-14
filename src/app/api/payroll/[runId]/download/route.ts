import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { generatePayrollRunExcel, type PayrollRunRow } from '@/lib/excel/payroll-run'
import { format } from 'date-fns'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!['COMPANY_ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
  })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { name: true },
  })
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    include: {
      employee: {
        select: {
          employeeNo: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
          otherDeductionItems: {
            where: { isActive: true },
            select: { label: true, amount: true },
          },
        },
      },
      incomes: {
        select: { typeName: true, amount: true },
      },
    },
    orderBy: [{ employee: { lastName: 'asc' } }],
  })

  const rows: PayrollRunRow[] = payslips.map(ps => {
    // Build per-income-type breakdown
    const incomeItems: Record<string, number> = {}
    let incomesSum = 0
    for (const inc of ps.incomes) {
      const amt = inc.amount.toNumber()
      if (amt > 0) {
        incomeItems[inc.typeName] = (incomeItems[inc.typeName] ?? 0) + amt
        incomesSum += amt
      }
    }
    const manual = ps.manualEdits as {
      customIncomes?: Array<{ label: string; amount: number }>
      customDeductions?: Array<{ label: string; amount: number }>
    } | null
    const customIncomes = Array.isArray(manual?.customIncomes) ? manual.customIncomes : []
    for (const inc of customIncomes) {
      const amount = Number(inc.amount)
      if (inc.label && amount > 0) {
        incomeItems[inc.label] = (incomeItems[inc.label] ?? 0) + amount
        incomesSum += amount
      }
    }

    // Allowances = de minimis only; residual otherEarnings (not covered by
    // income items) goes into the base "Allowances" column so totals still tie.
    const deminimis =
      ps.riceAllowance.toNumber() +
      ps.clothingAllowance.toNumber() +
      ps.medicalAllowance.toNumber()
    const residualOther = ps.otherEarnings.toNumber() - incomesSum
    const allowances = deminimis + (residualOther > 0.01 ? residualOther : 0)

    const deductionItems: Record<string, number> = {}
    let deductionsSum = 0
    for (const deduction of ps.employee.otherDeductionItems) {
      const amount = Number(deduction.amount)
      if (amount > 0) {
        deductionItems[deduction.label] = (deductionItems[deduction.label] ?? 0) + amount
        deductionsSum += amount
      }
    }
    const customDeductions = Array.isArray(manual?.customDeductions) ? manual.customDeductions : []
    for (const deduction of customDeductions) {
      const amount = Number(deduction.amount)
      if (deduction.label && amount > 0) {
        deductionItems[deduction.label] = (deductionItems[deduction.label] ?? 0) + amount
        deductionsSum += amount
      }
    }
    const residualDeduction = ps.otherDeductions.toNumber() - deductionsSum
    if (residualDeduction > 0.01) deductionItems['Other Deductions'] = residualDeduction

    const sssEmployer = ps.sssEmployer.toNumber()
    const sssEc = ps.sssEc.toNumber()
    const philhealthEmployer = ps.philhealthEmployer.toNumber()
    const pagibigEmployer = ps.pagibigEmployer.toNumber()
    return {
      employeeNo: ps.employee.employeeNo || '',
      lastName: ps.employee.lastName,
      firstName: ps.employee.firstName,
      department: ps.employee.department?.name || '',
      position: ps.employee.position?.title || '',
      basicPay: ps.basicSalary.toNumber(),
      allowances,
      incomeItems,
      regularOt: ps.regularOtAmount.toNumber(),
      restDayOt: ps.restDayOtAmount.toNumber(),
      holidayOt: ps.holidayOtAmount.toNumber(),
      holidayPay: ps.holidayPayAmount.toNumber(),
      nightDiff: ps.nightDiffAmount.toNumber(),
      grossPay: ps.grossPay.toNumber(),
      sssEmployee: ps.sssEmployee.toNumber(),
      philhealthEmployee: ps.philhealthEmployee.toNumber(),
      pagibigEmployee: ps.pagibigEmployee.toNumber(),
      withholdingTax: ps.withholdingTax.toNumber(),
      sssLoan: ps.sssLoanDeduction.toNumber(),
      pagibigLoan: ps.pagibigLoan.toNumber(),
      companyLoan: ps.companyLoan.toNumber(),
      lateDeduction: ps.lateDeduction.toNumber(),
      undertimeDeduction: ps.undertimeDeduction.toNumber(),
      absenceDeduction: ps.absenceDeduction.toNumber(),
      deductionItems,
      totalDeductions: ps.totalDeductions.toNumber(),
      netPay: ps.netPay.toNumber(),
      sssEmployer,
      sssEc,
      philhealthEmployer,
      pagibigEmployer,
      totalEmployerCost: sssEmployer + sssEc + philhealthEmployer + pagibigEmployer,
    }
  })

  const payDate = run.payDate ? format(new Date(run.payDate), 'MMMM d, yyyy') : ''
  const slug = run.periodLabel.replace(/[^a-zA-Z0-9-]/g, '_')
  const buf = generatePayrollRunExcel(company.name, run.periodLabel, payDate, rows)

  return new NextResponse(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Payroll-${slug}.xlsx"`,
    },
  })
}
