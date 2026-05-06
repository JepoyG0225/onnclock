import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/utils'

function makePeso(currency: string) {
  return (n: number) => formatCurrency(n, currency)
}

function wrap(text: string, maxChars = 52) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['-']
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ payslipId: string }> }) {
  const { payslipId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { name: true, address: true, tin: true, payrollCurrency: true },
  })
  if (!company) return NextResponse.json({ error: 'No company' }, { status: 403 })

  const currency = (company.payrollCurrency || 'PHP').toUpperCase()
  const peso = makePeso(currency)

  const payslip = await prisma.payslip.findFirst({
    where: { id: payslipId },
    include: {
      employee: {
        include: {
          company: { select: { id: true } },
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
      payrollRun: { select: { payDate: true, periodStart: true, periodEnd: true, periodLabel: true } },
    },
  })

  if (!payslip) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
  if (payslip.employee.company.id !== ctx.companyId) {
    return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
  }

  const emp = payslip.employee
  const allowancesTotal =
    payslip.riceAllowance.toNumber() +
    payslip.clothingAllowance.toNumber() +
    payslip.medicalAllowance.toNumber() +
    payslip.otherEarnings.toNumber()

  const loanDeductionsTotal =
    payslip.sssLoanDeduction.toNumber() +
    payslip.pagibigLoan.toNumber() +
    payslip.companyLoan.toNumber()

  const periodStart = payslip.payrollRun?.periodStart ? format(new Date(payslip.payrollRun.periodStart), 'MMMM d, yyyy') : '-'
  const periodEnd = payslip.payrollRun?.periodEnd ? format(new Date(payslip.payrollRun.periodEnd), 'MMMM d, yyyy') : '-'
  const payDate = payslip.payrollRun?.payDate ? format(new Date(payslip.payrollRun.payDate), 'MMMM d, yyyy') : '-'

  const earnings: [string, number][] = [
    ['Basic Pay', payslip.basicSalary.toNumber()],
    ['Regular Overtime (125%)', payslip.regularOtAmount.toNumber()],
    ['Rest Day OT (130%)', payslip.restDayOtAmount.toNumber()],
    ['Holiday OT', payslip.holidayOtAmount.toNumber()],
    ['Holiday Pay', payslip.holidayPayAmount.toNumber()],
    ['Night Differential', payslip.nightDiffAmount.toNumber()],
    ['Allowances', allowancesTotal],
  ]
  const earningsRows: Array<[string, number]> = earnings.filter(([, v]) => v > 0)

  const deductions = [
    ['SSS (Employee Share)', payslip.sssEmployee.toNumber()],
    ['PhilHealth (Employee)', payslip.philhealthEmployee.toNumber()],
    ['Pag-IBIG (Employee)', payslip.pagibigEmployee.toNumber()],
    ['Withholding Tax', payslip.withholdingTax.toNumber()],
    ['Late/Undertime', payslip.lateDeduction.toNumber() + payslip.undertimeDeduction.toNumber()],
    ['Absences', payslip.absenceDeduction.toNumber()],
    ['Loan Amortizations', loanDeductionsTotal],
    ['Other Deductions', payslip.otherDeductions.toNumber()],
  ] as const
  const deductionRows: Array<[string, number]> = deductions
    .filter(([, v]) => v > 0)
    .map(([label, value]) => [label, value])

  try {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595.28, 841.89])
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

    const C = {
      deep: rgb(0.10, 0.18, 0.26),
      base: rgb(0.18, 0.25, 0.34),
      mid: rgb(0.67, 0.72, 0.72),
      light: rgb(0.83, 0.85, 0.87),
      white: rgb(1, 1, 1),
      text: rgb(0.12, 0.16, 0.21),
      muted: rgb(0.39, 0.45, 0.52),
      alt: rgb(0.98, 0.98, 0.98),
    }

    const draw = (t: string, x: number, y: number, size = 9, isBold = false, color = C.text) => {
      page.drawText(t, { x, y, size, font: isBold ? bold : font, color })
    }
    const drawRight = (t: string, rightX: number, y: number, size = 9, isBold = false, color = C.text) => {
      const f = isBold ? bold : font
      const w = f.widthOfTextAtSize(t, size)
      page.drawText(t, { x: rightX - w, y, size, font: f, color })
    }

    // Header
    page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 3, color: C.mid })
    page.drawRectangle({ x: 0, y: 838, width: 595.28, height: 4, color: C.base })
    page.drawRectangle({ x: 0, y: 760, width: 595.28, height: 78, color: C.deep })
    draw(company.name, 24, 804, 16, true, C.white)
    if (company.address) draw(company.address, 24, 790, 8, false, C.white)
    if (company.tin) draw(`TIN: ${company.tin}`, 24, 778, 8, false, C.white)
    draw('PAYSLIP', 480, 806, 12, true, C.white)
    drawRight(`Period: ${periodStart} - ${periodEnd}`, 572, 790, 8, false, C.white)
    drawRight(`Pay Date: ${payDate}`, 572, 778, 8, false, C.white)

    // Employee info card
    page.drawRectangle({ x: 24, y: 690, width: 547, height: 58, color: rgb(0.97, 0.98, 0.99), borderColor: C.light, borderWidth: 1 })
    draw(`${emp.lastName}, ${emp.firstName}`, 32, 730, 11, true, C.deep)
    draw(`Employee No.: ${emp.employeeNo ?? '-'}`, 32, 714, 8, true, C.base)
    draw(`Department: ${emp.department?.name ?? '-'}`, 180, 714, 8, true, C.base)
    draw(`Position: ${emp.position?.title ?? '-'}`, 340, 714, 8, true, C.base)
    draw(`TIN: ${emp.tinNo ?? '-'}   SSS: ${emp.sssNo ?? '-'}   PhilHealth: ${emp.philhealthNo ?? '-'}   Pag-IBIG: ${emp.pagibigNo ?? '-'}`, 32, 700, 8, true, C.muted)

    // Column headers
    draw('EARNINGS', 24, 674, 9, true, C.base)
    draw('DEDUCTIONS', 310, 674, 9, true, C.base)
    page.drawLine({ start: { x: 24, y: 670 }, end: { x: 285, y: 670 }, thickness: 1, color: C.light })
    page.drawLine({ start: { x: 310, y: 670 }, end: { x: 571, y: 670 }, thickness: 1, color: C.light })

    // Rows
    let yl = 654
    earningsRows.forEach(([label, value], i) => {
      if (i % 2 === 1) page.drawRectangle({ x: 24, y: yl - 4, width: 261, height: 18, color: C.alt })
      draw(label, 28, yl, 8.5, false, C.text)
      drawRight(peso(value), 280, yl, 8.5, true, C.base)
      yl -= 18
    })

    let yr = 654
    deductionRows.forEach(([label, value], i) => {
      if (i % 2 === 1) page.drawRectangle({ x: 310, y: yr - 4, width: 261, height: 18, color: C.alt })
      draw(label, 314, yr, 8.5, false, C.text)
      drawRight(peso(value), 566, yr, 8.5, true, C.base)
      yr -= 18
    })

    const totalsY = Math.min(yl, yr) - 10
    page.drawRectangle({ x: 24, y: totalsY - 8, width: 261, height: 24, color: rgb(0.95, 0.97, 0.99), borderColor: C.light, borderWidth: 1 })
    draw('Gross Pay', 28, totalsY, 9, true, C.deep)
    drawRight(peso(payslip.grossPay.toNumber()), 280, totalsY, 9, true, C.deep)

    page.drawRectangle({ x: 310, y: totalsY - 8, width: 261, height: 24, color: rgb(0.95, 0.97, 0.99), borderColor: C.light, borderWidth: 1 })
    draw('Total Deductions', 314, totalsY, 9, true, C.deep)
    drawRight(peso(payslip.totalDeductions.toNumber()), 566, totalsY, 9, true, C.deep)

    const netY = totalsY - 52
    page.drawRectangle({ x: 24, y: netY, width: 547, height: 44, color: C.deep })
    draw('NET PAY', 34, netY + 26, 10, true, C.white)
    draw('Take-home amount for this pay period', 34, netY + 12, 7.5, false, rgb(0.85, 0.88, 0.92))
    drawRight(peso(payslip.netPay.toNumber()), 562, netY + 17, 18, true, C.white)

    const ytdY = netY - 52
    page.drawRectangle({ x: 24, y: ytdY, width: 547, height: 36, color: rgb(0.97, 0.98, 0.99), borderColor: C.light, borderWidth: 1 })
    draw('YTD Gross Pay', 34, ytdY + 20, 8, true, C.muted)
    draw(peso(payslip.ytdGrossPay.toNumber()), 34, ytdY + 8, 10, true, C.deep)
    draw('YTD Withholding Tax', 310, ytdY + 20, 8, true, C.muted)
    draw(peso(payslip.ytdWithholdingTax.toNumber()), 310, ytdY + 8, 10, true, C.deep)

    const noteY = ytdY - 26
    const notes = wrap('This is a computer-generated payslip. No signature required. Please contact HR for any discrepancies.', 96)
    notes.forEach((line, idx) => draw(line, 24, noteY - idx * 10, 7.5, false, C.muted))

    const bytes = await pdf.save()
    const buffer = Buffer.from(bytes)
    const filename = `Payslip-${emp.employeeNo ?? emp.id}-${payslip.payrollRun?.periodStart ? format(new Date(payslip.payrollRun.periodStart), 'yyyy-MM') : 'unknown'}.pdf`

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[PDF] generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate PDF', detail: String(err) }, { status: 500 })
  }
}
