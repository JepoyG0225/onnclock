import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/utils'
import { pdfTextSafe as toWinAnsiSafe } from '@/lib/pdf-text-safe'

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
    select: { name: true, address: true, tin: true, payrollCurrency: true, logoUrl: true },
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

  // Any residual otherEarnings not accounted for by the itemized incomes
  const incomesSum = incomeLines.reduce((s, [, v]) => s + v, 0)
  const residualOther = payslip.otherEarnings.toNumber() - incomesSum

  // Itemized DOLE premium lines (Legal Holiday, LHND, Rest Day, Night Diff,
  // OT variants, …). When present they REPLACE the legacy aggregate
  // OT/holiday/ND rows so the payslip shows the precise breakdown — including
  // the LH vs LHND split for night shifts crossing into a holiday. Older
  // payslips computed before this feature have no premium rows and fall back
  // to the aggregate columns.
  // Fetched separately + guarded: the payslip_premiums table may not exist on
  // environments where the migration hasn't been applied yet.
  let premiumRows: { label: string; hours: number; amount: number }[] = []
  try {
    const rows = await prisma.payslipPremium.findMany({
      where: { payslipId },
      select: { label: true, hours: true, amount: true },
      orderBy: { amount: 'desc' },
    })
    premiumRows = rows.map(r => ({ label: r.label, hours: r.hours.toNumber(), amount: r.amount.toNumber() }))
  } catch { premiumRows = [] }

  void premiumRows
  // Night differential is shown as two explicit lines: the regular-day part
  // and the holiday part (the ND earned on holiday hours). holidayNightDiff is
  // the slice of nightDiffAmount attributable to holiday hours; the remainder
  // is the regular ND. (Old payslips have holidayNightDiff = 0 → all ND shows
  // as Regular ND until recomputed.)
  const ndTotal = payslip.nightDiffAmount.toNumber()
  const holidayNd = (payslip as { holidayNightDiffAmount?: { toNumber(): number } }).holidayNightDiffAmount?.toNumber?.() ?? 0
  const regularNd = Math.max(0, parseFloat((ndTotal - holidayNd).toFixed(2)))

  const premiumLineItems: [string, number][] = [
    ['Regular Overtime (125%)', payslip.regularOtAmount.toNumber()],
    ['Rest Day OT (130%)', payslip.restDayOtAmount.toNumber()],
    ['Holiday OT', payslip.holidayOtAmount.toNumber()],
    ['Regular Night Differential', regularNd],
    ['Holiday Pay', payslip.holidayPayAmount.toNumber()],
    ['Holiday Night Differential', holidayNd],
  ]

  const earnings: [string, number][] = [
    ['Basic Pay', payslip.basicSalary.toNumber()],
    ...premiumLineItems,
    ['Allowances', allowancesTotal],
    ...incomeLines,
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
  const useItems = otherDedItems.length > 0 && Math.abs(itemsSum - otherDedTotal) < 0.01
  const otherDedLines: Array<[string, number]> = useItems
    ? otherDedItems.filter(d => d.amount > 0).map(d => [(d.label || 'Other Deduction').trim(), d.amount] as [string, number])
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

    // Header — logo top-left, payslip meta top-right (no colored band).
    // Footer accent bar only.
    page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 3, color: C.mid })

    // Try to embed the company logo; fall back to the company name on any
    // failure (missing/unreachable URL, unsupported format, decode error).
    let logoImg: Awaited<ReturnType<typeof pdf.embedPng>> | null = null
    if (company.logoUrl) {
      try {
        let imgBytes: Uint8Array | null = null
        if (company.logoUrl.startsWith('data:')) {
          const base64 = company.logoUrl.split(',')[1] || ''
          imgBytes = new Uint8Array(Buffer.from(base64, 'base64'))
        } else {
          const res = await fetch(company.logoUrl)
          if (res.ok) imgBytes = new Uint8Array(await res.arrayBuffer())
        }
        if (imgBytes && imgBytes.length) {
          const isPng = imgBytes[0] === 0x89 && imgBytes[1] === 0x50
          logoImg = isPng ? await pdf.embedPng(imgBytes) : await pdf.embedJpg(imgBytes)
        }
      } catch (e) {
        console.error('[PDF] logo embed failed:', e)
        logoImg = null
      }
    }

    // Address/TIN start just BELOW the logo (or the company name) so they
    // never overlap it. metaY is derived from the logo's actual bottom edge.
    let metaY: number
    if (logoImg) {
      const maxW = 180, maxH = 44
      const scale = Math.min(maxW / logoImg.width, maxH / logoImg.height, 1)
      const w = logoImg.width * scale
      const h = logoImg.height * scale
      const logoTop = 828
      page.drawImage(logoImg, { x: 24, y: logoTop - h, width: w, height: h })
      metaY = (logoTop - h) - 12
    } else {
      draw(company.name, 24, 812, 16, true, C.deep)
      metaY = 794
    }

    if (company.address) { draw(company.address, 24, metaY, 8, false, C.muted); metaY -= 11 }
    if (company.tin) { draw(`TIN: ${company.tin}`, 24, metaY, 8, false, C.muted); metaY -= 11 }

    drawRight('PAYSLIP', 571, 816, 14, true, C.deep)
    drawRight(`Period: ${periodStart} - ${periodEnd}`, 571, 800, 8, false, C.muted)
    drawRight(`Pay Date: ${payDate}`, 571, 788, 8, false, C.muted)

    // Separator sits just under the meta text, clamped so it stays above the
    // employee info card (top at y=748).
    const sepY = Math.max(Math.min(metaY + 2, 770), 751)
    page.drawLine({ start: { x: 24, y: sepY }, end: { x: 571, y: sepY }, thickness: 1, color: C.light })

    // Employee info card — give Department and Position their OWN lines
    // (each spanning the full card width) so long values don't overlap the
    // next field. Card height bumped up slightly to fit the extra row.
    page.drawRectangle({ x: 24, y: 678, width: 547, height: 70, color: rgb(0.97, 0.98, 0.99), borderColor: C.light, borderWidth: 1 })
    draw(`${emp.lastName}, ${emp.firstName}`, 32, 730, 11, true, C.deep)
    draw(`Employee No.: ${emp.employeeNo ?? '-'}`, 32, 716, 8, true, C.base)
    draw(`Department: ${emp.department?.name ?? '-'}`, 32, 704, 8, true, C.base)
    draw(`Position: ${emp.position?.title ?? '-'}`, 32, 692, 8, true, C.base)
    draw(`TIN: ${emp.tinNo ?? '-'}   SSS: ${emp.sssNo ?? '-'}   PhilHealth: ${emp.philhealthNo ?? '-'}   Pag-IBIG: ${emp.pagibigNo ?? '-'}`, 32, 681, 7.5, true, C.muted)

    // Column headers — pushed down to clear the taller employee card above
    draw('EARNINGS', 24, 662, 9, true, C.base)
    draw('DEDUCTIONS', 310, 662, 9, true, C.base)
    page.drawLine({ start: { x: 24, y: 658 }, end: { x: 285, y: 658 }, thickness: 1, color: C.light })
    page.drawLine({ start: { x: 310, y: 658 }, end: { x: 571, y: 658 }, thickness: 1, color: C.light })

    // Rows
    let yl = 642
    earningsRows.forEach(([label, value], i) => {
      if (i % 2 === 1) page.drawRectangle({ x: 24, y: yl - 4, width: 261, height: 18, color: C.alt })
      draw(label, 28, yl, 8.5, false, C.text)
      drawRight(peso(value), 280, yl, 8.5, true, C.base)
      yl -= 18
    })

    // Match earnings column start (yl = 642) so the first deduction row
    // doesn't overlap the "DEDUCTIONS" header at y=662 / the underline
    // at y=658. Previously yr=654 produced a visible overlap.
    let yr = 642
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
