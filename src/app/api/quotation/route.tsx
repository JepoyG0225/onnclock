import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

const MONTHLY_PRICE = 50
const ANNUAL_PRICE_PER_MONTH = 40

const THEME = {
  deep: rgb(0.10, 0.18, 0.26), // #1A2D42
  base: rgb(0.18, 0.25, 0.34), // #2E4156
  mid: rgb(0.67, 0.72, 0.72),  // #AAB7B7
  light: rgb(0.83, 0.85, 0.87), // #D4D8DD
  white: rgb(1, 1, 1),
  text: rgb(0.14, 0.16, 0.20),
  muted: rgb(0.38, 0.43, 0.49),
  successBg: rgb(0.93, 0.97, 0.94),
  successText: rgb(0.12, 0.44, 0.26),
}

type Plan = 'MONTHLY' | 'ANNUAL'

interface QuotationInput {
  plan?: Plan
  seats?: number
  clientName?: string
  clientCompany?: string
  clientEmail?: string
  validDays?: number
  quotationNo?: string
  issuedDate?: string
  includeSetup?: boolean
  setupFee?: number
  notes?: string
}

function toNumber(v: unknown, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function cleanText(v: unknown, fallback = '-') {
  const s = String(v ?? '').trim()
  return s || fallback
}

function safeDate(input: string) {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return new Date()
  return d
}

function peso(n: number) {
  return `PHP ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function wrapText(text: string, maxChars = 76) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word
    if (next.length > maxChars && cur) {
      lines.push(cur)
      cur = word
    } else {
      cur = next
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['-']
}

async function embedLogo(pdf: PDFDocument) {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'invoice-logo.png')
    if (!fs.existsSync(logoPath)) return null
    const bytes = fs.readFileSync(logoPath)
    return await pdf.embedPng(bytes)
  } catch {
    return null
  }
}

async function embedTextFonts(pdf: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
  try {
    const regularPath = path.join(process.cwd(), 'public', 'fonts', 'montserrat', 'static', 'Montserrat-Regular.ttf')
    const boldPath = path.join(process.cwd(), 'public', 'fonts', 'montserrat', 'static', 'Montserrat-Bold.ttf')
    if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
      const [regularBytes, boldBytes] = await Promise.all([
        fs.promises.readFile(regularPath),
        fs.promises.readFile(boldPath),
      ])
      return {
        regular: await pdf.embedFont(regularBytes),
        bold: await pdf.embedFont(boldBytes),
      }
    }
  } catch {
    // Fallback below
  }
  return {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
}

async function buildPdf(q: Required<QuotationInput>) {
  const pdf = await PDFDocument.create()
  const { regular: font, bold } = await embedTextFonts(pdf)
  const logo = await embedLogo(pdf)

  const features = [
    ['Attendance & Time Tracking', 'Fingerprint clock-in, GPS geofencing, facial recognition, and real-time attendance monitoring.'],
    ['Automated Payroll', 'Semi-monthly, monthly, and daily payroll processing with full Philippine deductions.'],
    ['Government Compliance', 'Auto-compute SSS, PhilHealth, Pag-IBIG, and BIR withholding tax with ready-to-file reports.'],
    ['Employee Self-Service Portal', 'Employees can clock in/out, view payslips, file leaves, and track balances on mobile.'],
    ['Leave Management', 'Configurable leave types, approval workflows, and automatic balance tracking.'],
    ['Loan & Deduction Tracking', 'Salary loans and deductions automatically amortized across payroll runs.'],
    ['Government Reports', 'BIR Alphalist, 2316, SSS R3, PhilHealth RF-1, and Pag-IBIG MCRF print-ready.'],
    ['Admin Dashboard', 'Company-wide analytics, department breakdown, and real-time workforce overview.'],
  ]

  const issued = safeDate(q.issuedDate)
  const validUntil = new Date(issued)
  validUntil.setDate(validUntil.getDate() + q.validDays)

  const pricePerSeat = q.plan === 'ANNUAL' ? ANNUAL_PRICE_PER_MONTH : MONTHLY_PRICE
  const periods = q.plan === 'ANNUAL' ? 12 : 1
  const subtotal = pricePerSeat * q.seats * periods
  const setupFee = q.includeSetup ? q.setupFee : 0
  const total = subtotal + setupFee
  const savings = q.plan === 'ANNUAL' ? MONTHLY_PRICE * 12 * q.seats - subtotal : 0

  const drawBox = (
    page: ReturnType<PDFDocument['addPage']>,
    x: number,
    y: number,
    w: number,
    h: number,
    color = THEME.white,
    border = THEME.light,
  ) => {
    page.drawRectangle({ x, y, width: w, height: h, color, borderColor: border, borderWidth: 1 })
  }

  const drawText = (
    page: ReturnType<PDFDocument['addPage']>,
    txt: string,
    x: number,
    y: number,
    size = 10,
    isBold = false,
    color = THEME.text,
  ) => {
    page.drawText(txt, { x, y, size, font: isBold ? bold : font, color })
  }

  const drawRightText = (
    page: ReturnType<PDFDocument['addPage']>,
    txt: string,
    rightX: number,
    y: number,
    size = 10,
    isBold = false,
    color = THEME.text,
  ) => {
    const activeFont = isBold ? bold : font
    const textWidth = activeFont.widthOfTextAtSize(txt, size)
    page.drawText(txt, { x: rightX - textWidth, y, size, font: activeFont, color })
  }

  const drawWrapped = (
    page: ReturnType<PDFDocument['addPage']>,
    txt: string,
    x: number,
    y: number,
    size = 9,
    isBold = false,
    color = THEME.text,
    maxChars = 72,
    lineH = 12,
  ) => {
    let cy = y
    for (const line of wrapText(txt, maxChars)) {
      drawText(page, line, x, cy, size, isBold, color)
      cy -= lineH
    }
    return cy
  }

  const page1 = pdf.addPage([612, 792]) // LETTER
  page1.drawRectangle({ x: 0, y: 0, width: 612, height: 3, color: THEME.mid })
  page1.drawRectangle({ x: 0, y: 788, width: 612, height: 4, color: THEME.base })
  page1.drawRectangle({ x: 0, y: 700, width: 612, height: 88, color: THEME.deep })

  if (logo) {
    page1.drawImage(logo, { x: 40, y: 734, width: 120, height: 36 })
  } else {
    drawText(page1, 'Onclock', 40, 748, 20, true, THEME.white)
  }
  drawText(page1, 'Helping Businesses Scale with Modern Web Solutions', 40, 720, 9, true, THEME.white)
  drawText(page1, 'QUOTATION', 430, 754, 20, true, THEME.white)
  drawText(page1, `#${q.quotationNo}`, 430, 738, 10, true, THEME.white)
  drawText(page1, `Issued: ${q.issuedDate}`, 430, 724, 9, true, THEME.white)
  drawText(page1, `Valid until: ${validUntil.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`, 430, 710, 9, true, THEME.white)

  drawBox(page1, 40, 608, 170, 76)
  drawBox(page1, 221, 608, 170, 76)
  drawBox(page1, 402, 608, 170, 76)

  drawText(page1, 'PREPARED FOR', 50, 670, 8, true, THEME.base)
  drawText(page1, q.clientName || '-', 50, 654, 11, true, THEME.deep)
  drawText(page1, q.clientCompany || '-', 50, 640, 9, true, THEME.base)
  if (q.clientEmail !== '-') drawText(page1, q.clientEmail, 50, 628, 9, true, THEME.base)

  drawText(page1, 'ISSUED BY', 231, 670, 8, true, THEME.base)
  drawText(page1, 'JCG Web App Solutions', 231, 654, 11, true, THEME.deep)

  drawText(page1, 'SELECTED PLAN', 412, 670, 8, true, THEME.base)
  drawText(page1, q.plan === 'ANNUAL' ? 'Annual (billed yearly)' : 'Monthly (billed monthly)', 412, 654, 10, true, THEME.deep)
  drawText(page1, `${q.seats} employee seat${q.seats !== 1 ? 's' : ''}`, 412, 640, 9, true, THEME.base)
  drawText(page1, `${peso(pricePerSeat)} / seat / month`, 412, 628, 9, true, THEME.base)

  drawText(page1, 'Pricing Breakdown', 40, 586, 12, true, THEME.deep)
  page1.drawLine({ start: { x: 40, y: 582 }, end: { x: 220, y: 582 }, thickness: 2, color: THEME.base })

  page1.drawRectangle({ x: 40, y: 556, width: 532, height: 22, color: THEME.base })
  drawText(page1, 'Description', 48, 563, 9, true, THEME.white)
  drawText(page1, 'Qty', 335, 563, 9, true, THEME.white)
  drawText(page1, 'Unit Price', 405, 563, 9, true, THEME.white)
  drawText(page1, 'Amount', 515, 563, 9, true, THEME.white)

  const drawTableRow = (y: number, alt: boolean, title: string, sub: string, qty: string, unit: string, amt: string, subColor = THEME.base) => {
    if (alt) page1.drawRectangle({ x: 40, y: y - 34, width: 532, height: 34, color: rgb(0.97, 0.98, 0.99) })
    page1.drawLine({ start: { x: 40, y: y - 34 }, end: { x: 572, y: y - 34 }, thickness: 1, color: THEME.light })
    drawText(page1, title, 48, y - 13, 10, true, THEME.deep)
    drawText(page1, sub, 48, y - 26, 8.5, true, subColor)
    drawRightText(page1, qty, 367, y - 20, 10, true)
    drawRightText(page1, unit, 482, y - 20, 10, true)
    drawRightText(page1, amt, 562, y - 20, 10, true)
  }

  let tableY = 556
  drawTableRow(
    tableY,
    false,
    `Onclock ${q.plan === 'ANNUAL' ? 'Annual' : 'Monthly'} Subscription`,
    `${q.seats} seats x ${peso(pricePerSeat)}/mo x ${periods} ${periods > 1 ? 'months' : 'month'}`,
    String(q.seats),
    peso(pricePerSeat * periods),
    peso(subtotal),
  )
  tableY -= 34

  if (q.includeSetup) {
    drawTableRow(
      tableY,
      true,
      'One-time Setup and Onboarding Fee',
      'Account configuration, data import, and 1-hour orientation',
      '1',
      peso(setupFee),
      peso(setupFee),
    )
    tableY -= 34
  }

  if (savings > 0) {
    page1.drawRectangle({ x: 40, y: tableY - 34, width: 532, height: 34, color: THEME.successBg })
    page1.drawLine({ start: { x: 40, y: tableY - 34 }, end: { x: 572, y: tableY - 34 }, thickness: 1, color: THEME.light })
    drawText(page1, 'Annual Plan Discount (20% off monthly rate)', 48, tableY - 13, 10, true, THEME.successText)
    drawText(page1, `vs. paying PHP ${(MONTHLY_PRICE * 12 * q.seats).toLocaleString()} monthly`, 48, tableY - 26, 8.5, true, THEME.base)
    drawRightText(page1, '-', 367, tableY - 20, 10, true)
    drawRightText(page1, '-', 482, tableY - 20, 10, true)
    drawRightText(page1, `-${peso(savings)}`, 562, tableY - 20, 10, true, THEME.successText)
    tableY -= 34
  }

  page1.drawRectangle({ x: 40, y: tableY - 74, width: 532, height: 74, color: THEME.deep })
  drawText(page1, `TOTAL DUE (${q.plan === 'ANNUAL' ? '1 year' : '1 month'})`, 50, tableY - 25, 10, true, THEME.white)
  if (savings > 0) {
    page1.drawRectangle({ x: 50, y: tableY - 48, width: 180, height: 16, color: THEME.base })
    drawText(page1, `You save ${peso(savings)} vs. monthly`, 56, tableY - 43, 8, true, THEME.white)
  }
  drawRightText(page1, peso(total), 562, tableY - 38, 20, true, THEME.white)

  let afterTotalY = tableY - 90
  if (q.notes !== '-') {
    drawBox(page1, 40, afterTotalY - 64, 532, 64, rgb(0.97, 0.98, 0.99), THEME.light)
    drawText(page1, 'Notes', 50, afterTotalY - 18, 9, true, THEME.base)
    drawWrapped(page1, q.notes, 50, afterTotalY - 32, 9, true, THEME.base, 90, 11)
    afterTotalY -= 74
  }

  page1.drawLine({ start: { x: 40, y: afterTotalY - 8 }, end: { x: 572, y: afterTotalY - 8 }, thickness: 1, color: THEME.light })
  drawText(page1, 'Terms', 40, afterTotalY - 22, 8.5, true, THEME.text)
  drawText(page1, `- Payment is due within ${q.validDays} days from quotation date.`, 40, afterTotalY - 34, 8.5, true, THEME.base)
  drawText(page1, '- Pricing is in Philippine Peso (PHP), inclusive of platform fees.', 40, afterTotalY - 45, 8.5, true, THEME.base)
  drawText(page1, '- Government taxes (VAT) not included unless otherwise stated.', 40, afterTotalY - 56, 8.5, true, THEME.base)
  drawText(page1, '- Subscription auto-renews unless cancelled 7 days before period end.', 40, afterTotalY - 67, 8.5, true, THEME.base)

  drawText(page1, 'Compliant with:', 450, afterTotalY - 22, 8.5, true, THEME.base)
  const badges = ['BIR', 'SSS', 'PhilHealth', 'Pag-IBIG', 'DOLE']
  let bx = 450
  let by = afterTotalY - 36
  for (const b of badges) {
    const w = Math.max(34, bold.widthOfTextAtSize(b, 8) + 12)
    if (bx + w > 572) {
      bx = 450
      by -= 16
    }
    page1.drawRectangle({ x: bx, y: by, width: w, height: 13, color: rgb(0.97, 0.98, 0.99), borderColor: THEME.light, borderWidth: 1 })
    drawText(page1, b, bx + 6, by + 3, 8, true, THEME.base)
    bx += w + 6
  }
  drawText(page1, 'Page 1 of 2 - Onclock HR and Payroll Platform - onclockph.com', 345, 22, 8, true, THEME.base)

  const page2 = pdf.addPage([612, 792])
  page2.drawRectangle({ x: 0, y: 0, width: 612, height: 3, color: THEME.mid })
  page2.drawRectangle({ x: 0, y: 788, width: 612, height: 4, color: THEME.base })

  drawText(page2, 'What is Included in Your Plan', 40, 742, 12, true, THEME.deep)
  page2.drawLine({ start: { x: 40, y: 738 }, end: { x: 248, y: 738 }, thickness: 2, color: THEME.base })
  drawText(page2, 'All plans include access to the full Onclock platform. Below is a summary of features available to your team.', 40, 724, 8.5, true, THEME.base)

  let fx = 40
  let fy = 688
  const cardW = 255
  const cardH = 62
  for (let i = 0; i < features.length; i++) {
    const [title, desc] = features[i]
    drawBox(page2, fx, fy - cardH, cardW, cardH, rgb(0.97, 0.98, 0.99), THEME.light)
    drawText(page2, title, fx + 10, fy - 18, 9.5, true, THEME.deep)
    drawWrapped(page2, desc, fx + 10, fy - 31, 8.5, true, THEME.base, 43, 10)

    if (i % 2 === 0) {
      fx = 317
    } else {
      fx = 40
      fy -= 72
    }
  }

  drawBox(page2, 40, 242, 532, 74, rgb(0.97, 0.98, 0.99), THEME.light)
  drawText(page2, 'Included Support', 50, 300, 9.5, true, THEME.deep)
  drawText(page2, '- Email and chat support during business hours (Mon-Fri, 8AM-5PM)', 50, 286, 8.5, true, THEME.base)
  drawText(page2, '- Free onboarding assistance and payroll setup walkthrough', 50, 274, 8.5, true, THEME.base)
  drawText(page2, '- Software updates and new feature releases at no extra cost', 50, 262, 8.5, true, THEME.base)
  drawText(page2, '- Data export in Excel/CSV format at any time', 50, 250, 8.5, true, THEME.base)

  page2.drawRectangle({ x: 40, y: 154, width: 532, height: 74, color: THEME.deep })
  drawText(page2, 'Ready to get started?', 50, 206, 11, true, THEME.white)
  const cta = 'Visit onclockph.com to register your company for free. Your 7-day trial starts immediately - no credit card required. Upgrade anytime to unlock full payroll and government report generation.'
  drawWrapped(page2, cta, 50, 192, 8.5, true, THEME.white, 90, 11)

  page2.drawLine({ start: { x: 40, y: 138 }, end: { x: 572, y: 138 }, thickness: 1, color: THEME.light })
  drawText(page2, 'JCG Web App Solutions', 40, 124, 8.5, true, THEME.text)
  drawText(page2, `Quotation #${q.quotationNo}`, 448, 124, 8.5, true, THEME.base)
  drawText(page2, `Valid until ${validUntil.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}`, 390, 112, 8.5, true, THEME.base)
  drawText(page2, 'Page 2 of 2 - Onclock HR and Payroll Platform - onclockph.com', 345, 22, 8, true, THEME.base)

  return Buffer.from(await pdf.save())
}

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json()) as QuotationInput

    const payload: Required<QuotationInput> = {
      plan: raw.plan === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
      seats: Math.max(1, Math.floor(toNumber(raw.seats, 1))),
      clientName: cleanText(raw.clientName),
      clientCompany: cleanText(raw.clientCompany),
      clientEmail: cleanText(raw.clientEmail),
      validDays: Math.max(1, Math.floor(toNumber(raw.validDays, 7))),
      quotationNo: cleanText(raw.quotationNo, 'Q-NA'),
      issuedDate: cleanText(raw.issuedDate, '1970-01-01'),
      includeSetup: Boolean(raw.includeSetup),
      setupFee: Math.max(0, toNumber(raw.setupFee, 0)),
      notes: cleanText(raw.notes, '-'),
    }

    const pdfBuffer = await buildPdf(payload)

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Onclock-Quotation-${payload.quotationNo}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[quotation] PDF error:', err)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
