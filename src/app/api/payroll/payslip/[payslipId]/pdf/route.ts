import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { renderToBuffer, DocumentProps } from '@react-pdf/renderer'
import { PayslipDocument } from '@/lib/pdf/payslip-template'
import { registerPdfFonts } from '@/lib/pdf/register-pdf-fonts'
import { format } from 'date-fns'
import React, { ReactElement } from 'react'

export async function GET(req: NextRequest, { params }: { params: Promise<{ payslipId: string }> }) {
  registerPdfFonts()

  const { payslipId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
  })
  if (!company) return NextResponse.json({ error: 'No company' }, { status: 403 })

  const payslip = await prisma.payslip.findFirst({
    where: {
      id: payslipId,
    },
    include: {
      employee: {
        include: {
          company:    { select: { id: true } },
          department: { select: { name: true } },
          position:   { select: { title: true } },
        },
      },
      payrollRun: { select: { payDate: true, periodStart: true, periodEnd: true } },
    },
  })

  if (!payslip) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })

  // Verify the payslip belongs to this company
  if (payslip.employee.company.id !== ctx.companyId) {
    return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
  }

  const emp = payslip.employee

  const allowancesTotal =
    payslip.riceAllowance.toNumber() +
    payslip.clothingAllowance.toNumber() +
    payslip.medicalAllowance.toNumber() +
    payslip.otherAllowances.toNumber()

  const loanDeductionsTotal =
    payslip.sssLoanDeduction.toNumber() +
    payslip.pagibigLoan.toNumber() +
    payslip.companyLoan.toNumber()

  const data = {
    company: {
      name:    company.name,
      address: company.address ?? null,
      tinNo:   company.tin ?? null,
    },
    employee: {
      firstName:    emp.firstName,
      lastName:     emp.lastName,
      employeeNo:   emp.employeeNo ?? null,
      department:   emp.department?.name ?? null,
      position:     emp.position?.title ?? null,
      tinNo:        emp.tinNo ?? null,
      sssNo:        emp.sssNo ?? null,
      philhealthNo: emp.philhealthNo ?? null,
      pagibigNo:    emp.pagibigNo ?? null,
    },
    period: {
      start:   payslip.payrollRun?.periodStart
               ? format(new Date(payslip.payrollRun.periodStart), 'MMMM d, yyyy')
               : '—',
      end:     payslip.payrollRun?.periodEnd
               ? format(new Date(payslip.payrollRun.periodEnd), 'MMMM d, yyyy')
               : '—',
      payDate: payslip.payrollRun?.payDate
               ? format(new Date(payslip.payrollRun.payDate), 'MMMM d, yyyy')
               : '—',
    },
    earnings: {
      basicPay:         payslip.basicSalary.toNumber(),
      regularOtAmount:  payslip.regularOtAmount.toNumber(),
      restDayOtAmount:  payslip.restDayOtAmount.toNumber(),
      holidayOtAmount:  payslip.holidayOtAmount.toNumber(),
      nightDiffAmount:  payslip.nightDiffAmount.toNumber(),
      allowancesTotal,
      deMinimisTotal:   0,
    },
    deductions: {
      sssEmployee:         payslip.sssEmployee.toNumber(),
      philhealthEmployee:  payslip.philhealthEmployee.toNumber(),
      pagibigEmployee:     payslip.pagibigEmployee.toNumber(),
      withholdingTax:      payslip.withholdingTax.toNumber(),
      lateDeduction:       payslip.lateDeduction.toNumber(),
      undertimeDeduction:  payslip.undertimeDeduction.toNumber(),
      absenceDeduction:    payslip.absenceDeduction.toNumber(),
      loanDeductions:      loanDeductionsTotal,
      otherDeductions:     payslip.otherDeductions.toNumber(),
    },
    totals: {
      grossPay:        payslip.grossPay.toNumber(),
      totalDeductions: payslip.totalDeductions.toNumber(),
      netPay:          payslip.netPay.toNumber(),
    },
    ytd: {
      grossPay:        payslip.ytdGrossPay.toNumber(),
      withholdingTax:  payslip.ytdWithholdingTax.toNumber(),
    },
  }

  let buffer: Buffer
  try {
    buffer = await renderToBuffer(
      React.createElement(PayslipDocument, { data }) as ReactElement<DocumentProps>
    )
  } catch (err) {
    console.error('[PDF] renderToBuffer failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate PDF', detail: String(err) },
      { status: 500 }
    )
  }

  const periodStart = payslip.payrollRun?.periodStart
  const filename = `Payslip-${emp.employeeNo ?? emp.id}-${periodStart ? format(new Date(periodStart), 'yyyy-MM') : 'unknown'}.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      // inline = opens in browser PDF viewer; attachment = forces download
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
