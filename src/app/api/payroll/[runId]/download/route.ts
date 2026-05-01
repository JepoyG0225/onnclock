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

  const company = await prisma.company.findUnique({ where: { id: ctx.companyId } })
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
        },
      },
    },
    orderBy: [{ employee: { lastName: 'asc' } }],
  })

  const rows: PayrollRunRow[] = payslips.map(ps => {
    const otAmount =
      ps.regularOtAmount.toNumber() +
      ps.restDayOtAmount.toNumber() +
      ps.holidayOtAmount.toNumber() +
      ps.nightDiffAmount.toNumber()
    const allowances =
      ps.riceAllowance.toNumber() +
      ps.clothingAllowance.toNumber() +
      ps.medicalAllowance.toNumber() +
      ps.otherEarnings.toNumber()
    const loans =
      ps.sssLoanDeduction.toNumber() +
      ps.pagibigLoan.toNumber() +
      ps.companyLoan.toNumber()
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
      otAmount,
      grossPay: ps.grossPay.toNumber(),
      sssEmployee: ps.sssEmployee.toNumber(),
      philhealthEmployee: ps.philhealthEmployee.toNumber(),
      pagibigEmployee: ps.pagibigEmployee.toNumber(),
      withholdingTax: ps.withholdingTax.toNumber(),
      loans,
      otherDeductions: ps.otherDeductions.toNumber(),
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
