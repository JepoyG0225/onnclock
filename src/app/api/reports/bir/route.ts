import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { generateBIR1601C, generateAlphalist1604CF, generatePayrollRegister } from '@/lib/excel/bir-reports'
import { generateBir2316Pdf } from '@/lib/pdf/bir2316'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const type  = searchParams.get('type') ?? '1601c'
  const month = parseInt(searchParams.get('month') ?? '')
  const year  = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const employeeId = searchParams.get('employeeId') ?? undefined
  const debug = searchParams.get('debug') === '1'

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
  })
  if (!company) return NextResponse.json({ error: 'No company' }, { status: 403 })
  // —— Form 2316 ————————————————————————————————————————————————
  if (type === '2316') {
    if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 })

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: ctx.companyId },
    })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const yearStart = new Date(year, 0, 1)
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59)

    // Form 2316: include payslips whose pay date falls within the calendar year.
    const payslips = await prisma.payslip.findMany({
      where: {
        employeeId,
        payrollRun: {
          payDate: { gte: yearStart, lte: yearEnd },
          companyId: ctx.companyId,
        },
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
    })

    const totals = payslips.reduce((acc, p) => {
      acc.gross        += p.grossPay.toNumber()
      acc.basicSalary  += p.basicSalary.toNumber()
      acc.taxable      += p.taxableIncome.toNumber()
      acc.nonTaxable   += p.nonTaxableIncome.toNumber()
      acc.taxWithheld  += p.withholdingTax.toNumber()
      acc.sss          += p.sssEmployee.toNumber()
      acc.ph           += p.philhealthEmployee.toNumber()
      acc.pagibig      += p.pagibigEmployee.toNumber()
      acc.holidayPay   += p.holidayPayAmount.toNumber()
      acc.overtimePay  += (p.regularOtAmount.toNumber() + p.restDayOtAmount.toNumber() + p.holidayOtAmount.toNumber())
      acc.nightDiff    += p.nightDiffAmount.toNumber()
      acc.thirteenth   += p.thirteenthMonthContribution.toNumber()
      acc.deMinimis    += (p.riceAllowance.toNumber() + p.clothingAllowance.toNumber() + p.medicalAllowance.toNumber() + p.otherAllowances.toNumber())
      return acc
    }, { gross: 0, basicSalary: 0, taxable: 0, nonTaxable: 0, taxWithheld: 0, sss: 0, ph: 0, pagibig: 0, holidayPay: 0, overtimePay: 0, nightDiff: 0, thirteenth: 0, deMinimis: 0 })

    // thirteenthMonthContribution is tracked separately — NOT included in grossPay/nonTaxableIncome.
    // The 13th month is additional annual compensation on top of gross.
    const govContrib        = totals.sss + totals.ph + totals.pagibig
    const thirteenthNonTax  = Math.min(totals.thirteenth, 90000)
    const thirteenthTaxable = Math.max(0, totals.thirteenth - 90000)

    // For BIR 2316: gross includes 13th month; non-taxable adds 13th month non-taxable portion
    const effectiveGross      = totals.gross + totals.thirteenth
    const effectiveNonTaxable = totals.nonTaxable + thirteenthNonTax
    // Taxable = original payslip taxable + any taxable excess of 13th month (don't subtract from basic)
    const effectiveTaxable    = totals.taxable + thirteenthTaxable

    // Basic salary non-taxable: for employees with zero taxable income (below threshold),
    // show their total basic salary. Otherwise derive from non-taxable income minus other components.
    const basicSalaryNonTaxable = effectiveTaxable === 0
      ? totals.basicSalary
      : Math.max(0, totals.nonTaxable - govContrib - totals.deMinimis - totals.holidayPay - totals.overtimePay - totals.nightDiff)

    const fullName = `${employee.lastName}, ${employee.firstName} ${employee.middleName ?? ''}`.trim()
    const pdfBytes = await generateBir2316Pdf({
      year,
      employeeName: fullName,
      employeeTin: employee.tinNo ?? '',
      employeeAddress: employee.permanentAddress ?? employee.presentAddress ?? '',
      employeeZip: '',
      employeeBirthDate: employee.birthDate ? new Date(employee.birthDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '',
      employeeContact: employee.mobileNo ?? '',
      employerName: company.name,
      employerTin: company.tin ?? '',
      employerAddress: company.address ?? '',
      employerZip: '',
      grossComp: effectiveGross.toFixed(2),
      nonTaxable: effectiveNonTaxable.toFixed(2),
      taxable: effectiveTaxable.toFixed(2),
      taxWithheld: totals.taxWithheld.toFixed(2),
      sss: totals.sss.toFixed(2),
      philhealth: totals.ph.toFixed(2),
      pagibig: totals.pagibig.toFixed(2),
      basicSalaryNonTaxable: basicSalaryNonTaxable.toFixed(2),
      holidayPay: totals.holidayPay.toFixed(2),
      overtimePay: totals.overtimePay.toFixed(2),
      nightDiff: totals.nightDiff.toFixed(2),
      thirteenthMonth: totals.thirteenth.toFixed(2),
      deMinimis: totals.deMinimis.toFixed(2),
      isMinimumWageEarner: employee.isMinimumWageEarner,
      isExemptFromTax: employee.isExemptFromTax,
    }, debug)

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="BIR-2316-${year}-${employee.lastName}-${employee.firstName}.pdf"`,
      },
    })
  }


  // ── 1601C ────────────────────────────────────────────────────────────────────
  if (type === '1601c') {
    if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

    // Use pay date to determine the remittance month, not the coverage period.
    const payDateStart = new Date(year, month - 1, 1)
    const payDateEnd   = new Date(year, month, 0, 23, 59, 59)

    const payslips = await prisma.payslip.findMany({
      where: {
        employee: { companyId: ctx.companyId },
        payrollRun: {
          payDate: { gte: payDateStart, lte: payDateEnd },
        },
      },
      include: {
        employee: { select: { tinNo: true, firstName: true, lastName: true, middleName: true } },
      },
    })

    // Aggregate by employee
    const empMap = new Map<string, { tin: string; lastName: string; firstName: string; middleName: string; compensation: number; taxWithheld: number }>()
    for (const ps of payslips) {
      const grossPay = ps.grossPay.toNumber()
      const withholdingTax = ps.withholdingTax.toNumber()
      const existing = empMap.get(ps.employeeId)
      if (!existing) {
        empMap.set(ps.employeeId, {
          tin: ps.employee.tinNo || '',
          lastName: ps.employee.lastName,
          firstName: ps.employee.firstName,
          middleName: ps.employee.middleName || '',
          compensation: grossPay,
          taxWithheld: withholdingTax,
        })
      } else {
        existing.compensation += grossPay
        existing.taxWithheld  += withholdingTax
      }
    }

    const employees = Array.from(empMap.values())
    const monthName = new Date(year, month - 1).toLocaleString('en-PH', { month: 'long' })

    const buf = generateBIR1601C({
      companyName: company.name,
      tin: company.tin || '',
      address: company.address || '',
      month: `${monthName} ${year}`,
      year,
      totalCompensation: employees.reduce((s, e) => s + e.compensation, 0),
      totalTaxWithheld:  employees.reduce((s, e) => s + e.taxWithheld, 0),
      employees,
    })

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="BIR-1601C-${year}-${String(month).padStart(2,'0')}.xlsx"`,
      },
    })
  }

  // ── 1604CF Alphalist ─────────────────────────────────────────────────────────
  if (type === 'alphalist') {
    // Annual: include all payslips whose pay date falls within the calendar year.
    const yearStart = new Date(year, 0, 1)
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59)

    const employees = await prisma.employee.findMany({
      where: { companyId: ctx.companyId },
      include: {
        payslips: {
          where: {
            payrollRun: {
              payDate: { gte: yearStart, lte: yearEnd },
            },
          },
          select: { grossPay: true, withholdingTax: true, taxableIncome: true },
        },
      },
    })

    const rows = employees
      .filter(e => e.payslips.length > 0)
      .map((e, i) => {
        const totalComp    = e.payslips.reduce((s, p) => s + p.grossPay.toNumber(), 0)
        const taxWithheld  = e.payslips.reduce((s, p) => s + p.withholdingTax.toNumber(), 0)
        const taxableComp  = e.payslips.reduce((s, p) => s + p.taxableIncome.toNumber(), 0)
        return {
          seq: i + 1,
          tin: e.tinNo || '',
          lastName: e.lastName,
          firstName: e.firstName,
          middleName: e.middleName || '',
          dateOfBirth: e.birthDate ? new Date(e.birthDate).toLocaleDateString('en-PH') : '',
          address: e.permanentAddress || '',
          statusOfEmployment: e.isActive ? 'P' : 'R',
          regularCompensation: taxableComp,
          supplementaryCompensation: totalComp - taxableComp,
          totalCompensation: totalComp,
          taxWithheld,
          annualTaxDue: taxWithheld,
        }
      })

    const buf = generateAlphalist1604CF(company.name, company.tin || '', year, rows)

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="BIR-1604CF-Alphalist-${year}.xlsx"`,
      },
    })
  }

  // ── Payroll Register ─────────────────────────────────────────────────────────
  if (type === 'register') {
    if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

    // Use pay date to determine the register month, not the coverage period.
    const payDateStart = new Date(year, month - 1, 1)
    const payDateEnd   = new Date(year, month, 0, 23, 59, 59)

    const payslips = await prisma.payslip.findMany({
      where: {
        employee: { companyId: ctx.companyId },
        payrollRun: {
          payDate: { gte: payDateStart, lte: payDateEnd },
        },
      },
      include: {
        employee: {
          select: {
            employeeNo: true, firstName: true, lastName: true,
            department: { select: { name: true } },
          },
        },
      },
    })

    // Aggregate by employee
    const empMap = new Map<string, {
      employeeNo: string; lastName: string; firstName: string; department: string
      basicPay: number; allowances: number; otAmount: number; grossPay: number
      sssEmployee: number; philhealthEmployee: number; pagibigEmployee: number
      withholdingTax: number; loans: number; otherDeductions: number
      totalDeductions: number; netPay: number
    }>()

    for (const ps of payslips) {
      const key = ps.employeeId
      const existing = empMap.get(key)
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
      const loanDeductions =
        ps.sssLoanDeduction.toNumber() +
        ps.pagibigLoan.toNumber() +
        ps.companyLoan.toNumber()
      const row = {
        employeeNo: ps.employee.employeeNo || '',
        lastName: ps.employee.lastName,
        firstName: ps.employee.firstName,
        department: ps.employee.department?.name || '',
        basicPay: ps.basicSalary.toNumber(),
        allowances,
        otAmount,
        grossPay: ps.grossPay.toNumber(),
        sssEmployee: ps.sssEmployee.toNumber(),
        philhealthEmployee: ps.philhealthEmployee.toNumber(),
        pagibigEmployee: ps.pagibigEmployee.toNumber(),
        withholdingTax: ps.withholdingTax.toNumber(),
        loans: loanDeductions,
        otherDeductions: ps.otherDeductions.toNumber(),
        totalDeductions: ps.totalDeductions.toNumber(),
        netPay: ps.netPay.toNumber(),
      }

      if (!existing) {
        empMap.set(key, row)
      } else {
        for (const k of ['basicPay','allowances','otAmount','grossPay','sssEmployee','philhealthEmployee','pagibigEmployee','withholdingTax','loans','otherDeductions','totalDeductions','netPay'] as const) {
          existing[k] += row[k]
        }
      }
    }

    const monthName = new Date(year, month - 1).toLocaleString('en-PH', { month: 'long' })
    const buf = generatePayrollRegister(company.name, `${monthName} ${year}`, Array.from(empMap.values()))

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Payroll-Register-${year}-${String(month).padStart(2,'0')}.xlsx"`,
      },
    })
  }

  return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
}
