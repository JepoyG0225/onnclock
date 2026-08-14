import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/utils'
import { pdfTextSafe as toWinAnsiSafe } from '@/lib/pdf-text-safe'
import fs from 'fs'
import path from 'path'

function makePeso(currency: string) {
  return (n: number) => toWinAnsiSafe(formatCurrency(n, currency))
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

  // Fetch individual other-income items for this payslip
  const payslipIncomes = await prisma.payslipIncome.findMany({
    where: { payslipId },
    select: { typeName: true, amount: true },
    orderBy: { typeName: 'asc' },
  })

  const allowancesTotal =
    payslip.riceAllowance.toNumber() +
    payslip.clothingAllowance.toNumber() +
    payslip.medicalAllowance.toNumber()

  const loanDeductionsTotal =
    payslip.sssLoanDeduction.toNumber() +
    payslip.pagibigLoan.toNumber() +
    payslip.companyLoan.toNumber()

  const periodStart = payslip.payrollRun?.periodStart ? format(new Date(payslip.payrollRun.periodStart), 'MMMM d, yyyy') : '-'
  const periodEnd = payslip.payrollRun?.periodEnd ? format(new Date(payslip.payrollRun.periodEnd), 'MMMM d, yyyy') : '-'
  const payDate = payslip.payrollRun?.payDate ? format(new Date(payslip.payrollRun.payDate), 'MMMM d, yyyy') : '-'

  // Build itemized income lines from PayslipIncome records
  const incomeLines: [string, number][] = payslipIncomes
    .map(i => [i.typeName, i.amount.toNumber()] as [string, number])
    .filter(([, v]) => v > 0)
  const manualEdits = payslip.manualEdits as {
    customIncomes?: Array<{ label: string; amount: number }>
    customDeductions?: Array<{ label: string; amount: number }>
  } | null
  const customIncomeLines: Array<[string, number]> = Array.isArray(manualEdits?.customIncomes)
    ? manualEdits.customIncomes.filter(item => Number(item.amount) > 0).map(item => [item.label, Number(item.amount)])
    : []
  const customDeductionLines: Array<[string, number]> = Array.isArray(manualEdits?.customDeductions)
    ? manualEdits.customDeductions.filter(item => Number(item.amount) > 0).map(item => [item.label, Number(item.amount)])
    : []

  // Any residual otherEarnings not accounted for by the itemized incomes
  const incomesSum = [...incomeLines, ...customIncomeLines].reduce((s, [, v]) => s + v, 0)
  const residualOther = payslip.otherEarnings.toNumber() - incomesSum

  const earnings: [string, number][] = [
    ['Basic Pay', payslip.basicSalary.toNumber()],
    ['Regular Overtime (125%)', payslip.regularOtAmount.toNumber()],
    ['Rest Day OT (130%)', payslip.restDayOtAmount.toNumber()],
    ['Holiday OT', payslip.holidayOtAmount.toNumber()],
    ['Holiday Pay', payslip.holidayPayAmount.toNumber()],
    ['Night Differential', payslip.nightDiffAmount.toNumber()],
    ['Allowances', allowancesTotal],
    ...incomeLines,
    ...customIncomeLines,
    ...(residualOther > 0.01 ? [['Other Earnings', residualOther] as [string, number]] : []),
  ]
  const earningsRows: Array<[string, number]> = earnings.filter(([, v]) => v > 0)

  // Itemize "Other Deductions" from the employee's deduction setup, but only
  // when those items reconcile with the payslip's stored total (so the
  // breakdown can never disagree with what was actually deducted). Otherwise
  // show the single total line. Guarded so a missing table can't break the PDF.
  const otherDedTotal = payslip.otherDeductions.toNumber()
  let otherDedItems: { label: string; amount: number }[] = []
  try {
    const rows = await prisma.employeeOtherDeduction.findMany({
      where: { employeeId: payslip.employeeId, isActive: true },
      select: { label: true, amount: true },
      orderBy: { createdAt: 'asc' },
    })
    otherDedItems = rows.map(r => ({ label: r.label, amount: Number(r.amount) }))
  } catch { otherDedItems = [] }
  const itemsSum = otherDedItems.reduce((s, d) => s + d.amount, 0)
  const customDeductionTotal = customDeductionLines.reduce((sum, [, amount]) => sum + amount, 0)
  const useItems = otherDedItems.length > 0 && Math.abs(itemsSum + customDeductionTotal - otherDedTotal) < 0.01
  const otherDedLines: Array<[string, number]> = useItems
    ? [...otherDedItems.filter(d => d.amount > 0).map(d => [(d.label || 'Other Deduction').trim(), d.amount] as [string, number]), ...customDeductionLines]
    : customDeductionLines.length > 0 && Math.abs(customDeductionTotal - otherDedTotal) < 0.01
      ? customDeductionLines
      : (otherDedTotal > 0 ? [['Other Deductions', otherDedTotal] as [string, number]] : [])

  const deductions: Array<[string, number]> = [
    ['SSS (Employee Share)', payslip.sssEmployee.toNumber()],
    ['PhilHealth (Employee)', payslip.philhealthEmployee.toNumber()],
    ['Pag-IBIG (Employee)', payslip.pagibigEmployee.toNumber()],
    ['Withholding Tax', payslip.withholdingTax.toNumber()],
    ['Late/Undertime', payslip.lateDeduction.toNumber() + payslip.undertimeDeduction.toNumber()],
    ['Absences', payslip.absenceDeduction.toNumber()],
    ['Loan Amortizations', loanDeductionsTotal],
    ...otherDedLines,
  ]
  const deductionRows: Array<[string, number]> = deductions.filter(([, v]) => v > 0)

  try {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595.28, 841.89])
    let font
    let bold
    try {
      pdf.registerFontkit(fontkit)
      const fontDir = path.join(process.cwd(), 'public', 'fonts', 'montserrat', 'static')
      const [regularBytes, boldBytes] = await Promise.all([
        fs.promises.readFile(path.join(fontDir, 'Montserrat-Regular.ttf')),
        fs.promises.readFile(path.join(fontDir, 'Montserrat-Bold.ttf')),
      ])
      font = await pdf.embedFont(regularBytes, { subset: true })
      bold = await pdf.embedFont(boldBytes, { subset: true })
    } catch (fontError) {
      console.warn('[PDF] Montserrat unavailable; using Helvetica fallback:', fontError)
      font = await pdf.embedFont(StandardFonts.Helvetica)
      bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    }

    const C = {
      deep: rgb(0.043, 0.435, 0.984),
      base: rgb(0.122, 0.161, 0.216),
      mid: rgb(0.098, 0.761, 0.949),
      light: rgb(0.875, 0.906, 0.945),
      white: rgb(1, 1, 1),
      text: rgb(0.122, 0.161, 0.216),
      muted: rgb(0.392, 0.455, 0.545),
      alt: rgb(0.969, 0.984, 1),
      cyanSoft: rgb(0.925, 0.984, 1),
      rose: rgb(0.882, 0.153, 0.278),
      roseSoft: rgb(1, 0.949, 0.957),
    }

    // Wrap drawText so every string goes through the WinAnsi sanitizer.
    // Catches employee names with accents (José, María), smart quotes from
    // pasted notes, em dashes, etc. — anything pdf-lib's StandardFonts
    // can't encode.
    const draw = (t: string, x: number, y: number, size = 9, isBold = false, color = C.text) => {
      page.drawText(toWinAnsiSafe(t), { x, y, size, font: isBold ? bold : font, color })
    }
    const drawRight = (t: string, rightX: number, y: number, size = 9, isBold = false, color = C.text) => {
      const f = isBold ? bold : font
      const safe = toWinAnsiSafe(t)
      const w = f.widthOfTextAtSize(safe, size)
      page.drawText(safe, { x: rightX - w, y, size, font: f, color })
    }

    // Header
    page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 3, color: C.mid })
    page.drawRectangle({ x: 0, y: 838, width: 595.28, height: 4, color: C.mid })
    page.drawRectangle({ x: 0, y: 760, width: 595.28, height: 78, color: C.deep })
    draw(company.name, 24, 804, 16, true, C.white)
    if (company.address) draw(company.address, 24, 790, 8, false, C.white)
    if (company.tin) draw(`TIN: ${company.tin}`, 24, 778, 8, false, C.white)
    page.drawRectangle({ x: 485, y: 801, width: 86, height: 24, color: C.white, opacity: 0.16 })
    drawRight('PAYSLIP', 558, 808, 12, true, C.white)
    drawRight(`Period: ${periodStart} - ${periodEnd}`, 572, 790, 8, false, C.white)
    drawRight(`Pay Date: ${payDate}`, 572, 778, 8, false, C.white)

    // Employee info card — give Department and Position their OWN lines
    // (each spanning the full card width) so long values don't overlap the
    // next field. Card height bumped up slightly to fit the extra row.
    page.drawRectangle({ x: 24, y: 678, width: 547, height: 70, color: C.white, borderColor: C.light, borderWidth: 1 })
    page.drawRectangle({ x: 24, y: 678, width: 4, height: 70, color: C.mid })
    draw(`${emp.lastName}, ${emp.firstName}`, 32, 730, 11, true, C.deep)
    draw(`Employee No.: ${emp.employeeNo ?? '-'}`, 32, 716, 8, true, C.base)
    draw(`Department: ${emp.department?.name ?? '-'}`, 32, 704, 8, true, C.base)
    draw(`Position: ${emp.position?.title ?? '-'}`, 32, 692, 8, true, C.base)
    draw(`TIN: ${emp.tinNo ?? '-'}   SSS: ${emp.sssNo ?? '-'}   PhilHealth: ${emp.philhealthNo ?? '-'}   Pag-IBIG: ${emp.pagibigNo ?? '-'}`, 32, 681, 7.5, true, C.muted)

    // Column headers — pushed down to clear the taller employee card above
    page.drawRectangle({ x: 24, y: 650, width: 261, height: 20, color: C.alt })
    page.drawRectangle({ x: 310, y: 650, width: 261, height: 20, color: C.roseSoft })
    draw('EARNINGS', 30, 657, 9, true, C.deep)
    draw('DEDUCTIONS', 316, 657, 9, true, C.rose)

    // Rows
    let yl = 642
    earningsRows.forEach(([label, value], i) => {
      if (i % 2 === 1) page.drawRectangle({ x: 24, y: yl - 4, width: 261, height: 18, color: C.alt })
      draw(label, 28, yl, 8.5, false, C.text)
      drawRight(peso(value), 280, yl, 8.5, true, C.base)
      yl -= 18
    })
    if (earningsRows.length === 0) {
      draw('No earnings recorded', 28, yl, 8.5, false, C.muted)
      yl -= 18
    }

    // Match earnings column start (yl = 642) so the first deduction row
    // doesn't overlap the "DEDUCTIONS" header at y=662 / the underline
    // at y=658. Previously yr=654 produced a visible overlap.
    let yr = 642
    deductionRows.forEach(([label, value], i) => {
      if (i % 2 === 1) page.drawRectangle({ x: 310, y: yr - 4, width: 261, height: 18, color: C.roseSoft })
      draw(label, 314, yr, 8.5, false, C.text)
      drawRight(peso(value), 566, yr, 8.5, true, C.rose)
      yr -= 18
    })
    if (deductionRows.length === 0) {
      draw('No deductions for this period', 314, yr, 8.5, false, C.muted)
      yr -= 18
    }

    const totalsY = Math.min(yl, yr) - 10
    page.drawRectangle({ x: 24, y: totalsY - 8, width: 261, height: 24, color: C.alt, borderColor: C.light, borderWidth: 1 })
    draw('GROSS PAY', 28, totalsY, 9, true, C.deep)
    drawRight(peso(payslip.grossPay.toNumber()), 280, totalsY, 9, true, C.deep)

    page.drawRectangle({ x: 310, y: totalsY - 8, width: 261, height: 24, color: C.roseSoft, borderColor: rgb(0.98, 0.78, 0.82), borderWidth: 1 })
    draw('TOTAL DEDUCTIONS', 314, totalsY, 9, true, C.rose)
    drawRight(peso(payslip.totalDeductions.toNumber()), 566, totalsY, 9, true, C.rose)

    const netY = totalsY - 52
    page.drawRectangle({ x: 24, y: netY, width: 547, height: 44, color: C.deep })
    page.drawRectangle({ x: 24, y: netY, width: 6, height: 44, color: C.mid })
    draw('NET PAY', 34, netY + 26, 10, true, C.white)
    draw('Take-home amount for this pay period', 34, netY + 12, 7.5, false, rgb(0.85, 0.88, 0.92))
    drawRight(peso(payslip.netPay.toNumber()), 562, netY + 17, 18, true, C.white)

    const ytdY = netY - 52
    page.drawRectangle({ x: 24, y: ytdY, width: 547, height: 36, color: C.white, borderColor: C.light, borderWidth: 1 })
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
