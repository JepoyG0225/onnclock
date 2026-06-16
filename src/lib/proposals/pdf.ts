/**
 * Proposal / Quotation PDF generator (system-admin sales tool).
 * 3-page layout: Cover · Executive Summary + Feature comparison · Quotation.
 * Shared by the download and email endpoints so both produce the same document.
 */
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'
import { pdfTextSafe as safe } from '@/lib/pdf-text-safe'
import { effectiveDiscountPct } from '@/lib/billing/pricing'

export interface ProposalLineItem {
  description: string
  quantity: number
  unitPrice: number
}

export interface ProposalData {
  quoteNo: string
  date: string          // issued date, e.g. "2026-05-28" or "May 28, 2026"
  validityDays?: number
  subtitle?: string     // cover subtitle, default "FOR HRIS SYSTEM"
  clientCompany: string
  clientContact?: string
  clientEmail?: string
  clientAddress?: string
  seats: number
  billingCycle: '3_MONTH' | '6_MONTH' | 'ANNUAL'
  scope?: string        // executive summary
  notes?: string        // pricing note override
  preparedBy?: string
  // legacy/optional — no longer affect the template layout
  plan?: 'STANDARD' | 'PRO'
  includeSubscriptionLine?: boolean
  customItems?: ProposalLineItem[]
  features?: string[]
  includeComparison?: boolean
  validUntil?: string
}

const BASIC_PRICE = 50
const PRO_PRICE = 100
const CYCLE_MONTHS: Record<ProposalData['billingCycle'], number> = { '3_MONTH': 3, '6_MONTH': 6, ANNUAL: 12 }

// Feature matrix — labels and Basic/Pro inclusion (matches the OnClock plan tiers).
const FEATURES: { label: string; basic: boolean; pro: boolean }[] = [
  { label: 'Fingerprint clock-in, GPS geofencing', basic: true, pro: true },
  { label: 'Leave Management', basic: true, pro: true },
  { label: 'Live GPS Map', basic: true, pro: true },
  { label: 'Automated Payroll, 13th Month Pay calculation', basic: true, pro: true },
  { label: 'Automated Mandatory Deductions', basic: true, pro: true },
  { label: 'Government Reports', basic: true, pro: true },
  { label: 'Onboarding / Offboarding', basic: false, pro: true },
  { label: 'Performance Tracker', basic: false, pro: true },
  { label: 'Jobs & Applications Management', basic: false, pro: true },
  { label: 'Disciplinary Records', basic: false, pro: true },
  { label: 'Budget Requisitions', basic: false, pro: true },
  { label: 'Overtime Requests', basic: false, pro: true },
  { label: 'Screen Capture Tracker', basic: false, pro: true },
  { label: 'Disbursement', basic: false, pro: true },
]

export interface ProposalTotals {
  months: number
  discountPct: number
  basicRate: number
  proRate: number
  basicMonthlyTotal: number
  proMonthlyTotal: number
  total: number
}

export function computeProposalTotals(data: ProposalData): ProposalTotals {
  const months = CYCLE_MONTHS[data.billingCycle]
  const discountPct = effectiveDiscountPct(data.billingCycle, data.seats)
  const basicRate = Math.round(BASIC_PRICE * (1 - discountPct / 100))
  const proRate = Math.round(PRO_PRICE * (1 - discountPct / 100))
  const basicMonthlyTotal = basicRate * data.seats
  const proMonthlyTotal = proRate * data.seats
  const total = (data.plan === 'STANDARD' ? basicMonthlyTotal : proMonthlyTotal) * months
  return { months, discountPct, basicRate, proRate, basicMonthlyTotal, proMonthlyTotal, total }
}

const NAVY = rgb(0.043, 0.137, 0.298)   // #0b234
const BLUE = rgb(0.012, 0.169, 0.388)   // #032b63
const ORANGE = rgb(1, 0.349, 0)         // #ff5900
const GRAY = rgb(0.42, 0.45, 0.5)
const LIGHTGRAY = rgb(0.55, 0.58, 0.62)
const INK = rgb(0.12, 0.14, 0.17)
const ZEBRA = rgb(0.95, 0.965, 0.99)

function num(n: number): string {
  return n.toLocaleString('en-PH')
}

export async function buildProposalPdf(data: ProposalData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const A4: [number, number] = [595.28, 841.89]
  const W = A4[0], H = A4[1], M = 56

  const text = (p: PDFPage, s: string, x: number, y: number, size: number, f: PDFFont = font, color = INK) =>
    p.drawText(safe(s), { x, y, size, font: f, color })
  const right = (p: PDFPage, s: string, xr: number, y: number, size: number, f: PDFFont = font, color = INK) =>
    p.drawText(safe(s), { x: xr - f.widthOfTextAtSize(safe(s), size), y, size, font: f, color })

  // Brand lockup: small orange mark + "NEXDEV SYSTEMS"
  const brand = (p: PDFPage, x: number, yTop: number, onDark = false) => {
    p.drawRectangle({ x, y: yTop - 12, width: 12, height: 12, color: ORANGE })
    text(p, 'NEXDEV', x + 18, yTop - 6, 11, bold, onDark ? rgb(1, 1, 1) : NAVY)
    const wN = bold.widthOfTextAtSize('NEXDEV', 11)
    text(p, ' SYSTEMS', x + 18 + wN, yTop - 6, 11, font, onDark ? rgb(0.77, 0.85, 1) : GRAY)
  }

  const footer = (p: PDFPage) => {
    p.drawRectangle({ x: 0, y: 0, width: W, height: 44, color: NAVY })
    brand(p, M, 32, true)
    right(p, 'WWW.ONCLOCKPH.COM', W - M, 26, 8, bold, rgb(1, 1, 1))
    right(p, 'SALES@NEXDEVSYSTEMS.IO', W - M, 14, 8, font, rgb(0.77, 0.85, 1))
  }

  const drawCheck = (p: PDFPage, cx: number, cy: number) => {
    p.drawLine({ start: { x: cx - 4, y: cy + 0.5 }, end: { x: cx - 1, y: cy - 2.5 }, thickness: 1.7, color: rgb(0, 0.45, 0.2) })
    p.drawLine({ start: { x: cx - 1, y: cy - 2.5 }, end: { x: cx + 4.5, y: cy + 4 }, thickness: 1.7, color: rgb(0, 0.45, 0.2) })
  }
  const drawDash = (p: PDFPage, cx: number, cy: number) =>
    p.drawLine({ start: { x: cx - 3.5, y: cy }, end: { x: cx + 3.5, y: cy }, thickness: 1.4, color: rgb(0.75, 0.77, 0.8) })

  // ════════════════ PAGE 1 — COVER ════════════════
  {
    const p = pdf.addPage(A4)
    brand(p, M, H - 48)
    right(p, 'WWW.NEXDEVSYSTEMS.IO', W - M, H - 46, 8, bold, NAVY)
    right(p, 'INFO@NEXDEVSYSTEMS.IO', W - M, H - 58, 8, font, GRAY)
    p.drawLine({ start: { x: M, y: H - 74 }, end: { x: W - M, y: H - 74 }, thickness: 0.8, color: rgb(0.85, 0.87, 0.9) })

    // Title block
    text(p, 'PROPOSAL', M, H - 230, 58, bold, NAVY)
    p.drawRectangle({ x: M + 2, y: H - 252, width: 90, height: 5, color: ORANGE })
    text(p, (data.subtitle || 'FOR HRIS SYSTEM').toUpperCase(), M + 2, H - 280, 18, bold, ORANGE)

    // Prepared to
    let y = H - 380
    text(p, 'PREPARED TO:', M, y, 11, bold, BLUE); y -= 26
    text(p, (data.clientContact || data.clientCompany || '').toUpperCase(), M, y, 16, bold, INK); y -= 20
    if (data.clientCompany) { text(p, data.clientCompany.toUpperCase(), M, y, 12, bold, GRAY); y -= 16 }
    if (data.clientAddress) { text(p, data.clientAddress.toUpperCase(), M, y, 10.5, font, GRAY); y -= 22 }
    if (data.clientEmail) { text(p, data.clientEmail, M, y, 10.5, font, GRAY) }

    // Decorative bottom band
    p.drawRectangle({ x: 0, y: 0, width: W, height: 90, color: NAVY })
    p.drawRectangle({ x: 0, y: 90, width: W, height: 6, color: ORANGE })
    brand(p, M, 60, true)
    text(p, 'HR & Payroll System', M + 18, 30, 9, font, rgb(0.77, 0.85, 1))
    right(p, `Quotation #${data.quoteNo}`, W - M, 56, 9, bold, rgb(1, 1, 1))
    right(p, `Issued: ${data.date}`, W - M, 42, 8.5, font, rgb(0.77, 0.85, 1))
  }

  // ════════════════ PAGE 2 — EXECUTIVE SUMMARY + FEATURES ════════════════
  {
    const p = pdf.addPage(A4)
    brand(p, M, H - 48)
    p.drawLine({ start: { x: M, y: H - 64 }, end: { x: W - M, y: H - 64 }, thickness: 0.8, color: rgb(0.85, 0.87, 0.9) })
    let y = H - 100

    text(p, 'EXECUTIVE SUMMARY', M, y, 14, bold, NAVY)
    p.drawRectangle({ x: M, y: y - 8, width: 46, height: 3, color: ORANGE })
    y -= 28
    const summary = data.scope?.trim()
      || `OnClock by NexDev Systems delivers an end-to-end, fully Philippine-compliant HR and payroll platform — biometric/GPS time tracking, automated DTR and payroll (SSS, PhilHealth, Pag-IBIG, BIR), leave management, and a complete employee self-service portal in one integrated system.`
    for (const line of wrap(summary, 92, 14)) { text(p, line, M, y, 10.5, font, rgb(0.22, 0.24, 0.27)); y -= 15 }
    y -= 22

    // Features table
    text(p, 'FEATURES', M, y, 14, bold, NAVY)
    p.drawRectangle({ x: M, y: y - 8, width: 46, height: 3, color: ORANGE })
    const basicX = W - 150
    const proX = W - 70
    right(p, 'BASIC', basicX + 22, y, 10, bold, BLUE)
    right(p, 'PRO', proX + 16, y, 10, bold, BLUE)
    y -= 22
    p.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.8, color: rgb(0.8, 0.83, 0.87) })

    let alt = false
    for (const f of FEATURES) {
      if (alt) p.drawRectangle({ x: M - 6, y: y - 5, width: W - 2 * M + 12, height: 19, color: ZEBRA })
      alt = !alt
      text(p, f.label, M, y, 10, font, INK)
      if (f.basic) drawCheck(p, basicX, y + 3); else drawDash(p, basicX, y + 3)
      if (f.pro) drawCheck(p, proX, y + 3); else drawDash(p, proX, y + 3)
      y -= 19
    }
    footer(p)
  }

  // ════════════════ PAGE 3 — QUOTATION ════════════════
  {
    const p = pdf.addPage(A4)
    brand(p, M, H - 48)
    right(p, 'QUOTATION', W - M, H - 44, 20, bold, NAVY)
    right(p, `#${data.quoteNo}`, W - M, H - 62, 10, bold, GRAY)
    right(p, `Issued: ${data.date}`, W - M, H - 76, 9, font, GRAY)
    p.drawLine({ start: { x: M, y: H - 90 }, end: { x: W - M, y: H - 90 }, thickness: 0.8, color: rgb(0.85, 0.87, 0.9) })

    const totals = computeProposalTotals(data)
    let y = H - 130
    text(p, 'PRICING BREAKDOWN', M, y, 13, bold, NAVY)
    p.drawRectangle({ x: M, y: y - 8, width: 46, height: 3, color: ORANGE })
    y -= 26

    // Table header
    const cPrice = W - 250
    const cQty = W - 150
    const cTotal = W - M
    p.drawRectangle({ x: M - 6, y: y - 5, width: W - 2 * M + 12, height: 22, color: NAVY })
    text(p, 'PLAN', M, y + 2, 9.5, bold, rgb(1, 1, 1))
    right(p, 'PRICE', cPrice, y + 2, 9.5, bold, rgb(1, 1, 1))
    right(p, 'QTY', cQty, y + 2, 9.5, bold, rgb(1, 1, 1))
    right(p, 'TOTAL', cTotal, y + 2, 9.5, bold, rgb(1, 1, 1))
    y -= 28

    const rows = [
      { plan: 'Basic', rate: totals.basicRate, total: totals.basicMonthlyTotal },
      { plan: 'Pro', rate: totals.proRate, total: totals.proMonthlyTotal },
    ]
    let zebra = false
    for (const r of rows) {
      if (zebra) p.drawRectangle({ x: M - 6, y: y - 6, width: W - 2 * M + 12, height: 22, color: ZEBRA })
      zebra = !zebra
      text(p, r.plan, M, y, 11, bold, INK)
      right(p, num(r.rate), cPrice, y, 11, font, INK)
      right(p, num(data.seats), cQty, y, 11, font, INK)
      right(p, `${num(r.total)}/month`, cTotal, y, 11, bold, NAVY)
      y -= 26
    }
    y -= 6

    // Note
    const note = data.notes?.trim()
      || 'You can choose a subscription duration from 3 months up to 1 year. A 20% discount is applied to annual subscriptions.'
    for (const line of wrap(`Note: ${note}`, 96, 4)) { text(p, line, M, y, 9, font, LIGHTGRAY); y -= 13 }
    y -= 22

    // Validity
    text(p, 'VALIDITY', M, y, 12, bold, NAVY)
    p.drawRectangle({ x: M, y: y - 8, width: 40, height: 3, color: ORANGE })
    y -= 22
    text(p, `This quotation is valid for ${data.validityDays ?? 30} days from the date issued.`, M, y, 10, font, rgb(0.22, 0.24, 0.27))
    y -= 40

    // Approved by
    text(p, 'APPROVED BY:', M, y, 12, bold, NAVY)
    y -= 22
    text(p, (data.clientCompany || '').toUpperCase(), M, y, 11, bold, INK)
    y -= 30
    for (const label of ['Name: ______________________________', 'Date: _______________________________', 'Plan: _______________________________']) {
      text(p, label, M, y, 10.5, font, rgb(0.3, 0.32, 0.35)); y -= 24
    }
    if (data.preparedBy) right(p, `Prepared by: ${data.preparedBy}`, W - M, 70, 9, font, GRAY)

    footer(p)
  }

  return pdf.save()
}

function wrap(s: string, max: number, maxLines = 12): string[] {
  const words = s.replace(/\r?\n/g, ' \n ').split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (w === '\n') { lines.push(cur); cur = ''; continue }
    if ((cur + ' ' + w).trim().length > max) { lines.push(cur); cur = w }
    else cur = (cur ? cur + ' ' : '') + w
  }
  if (cur) lines.push(cur)
  return lines.slice(0, maxLines)
}
