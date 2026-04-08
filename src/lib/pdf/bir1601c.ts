/**
 * BIR Form 1601C — Monthly Remittance Return of Income Taxes Withheld on Compensation
 * Generated as a filled PDF mimicking the official BIR form layout.
 */
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'

export interface BIR1601CData {
  companyName: string
  tin: string
  address: string
  month: string
  monthNumber: number
  year: number
  totalCompensation: number
  totalTaxWithheld: number
  employees: {
    tin: string
    lastName: string
    firstName: string
    middleName: string
    compensation: number
    taxWithheld: number
  }[]
}

const BLACK  = rgb(0, 0, 0)
const GRAY   = rgb(0.5, 0.5, 0.5)
const LGRAY  = rgb(0.88, 0.88, 0.88)
const RED    = rgb(0.7, 0.05, 0.05)
const WHITE  = rgb(1, 1, 1)

function fmt(n: number) {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function box(page: PDFPage, x: number, y: number, w: number, h: number, opts?: { fill?: ReturnType<typeof rgb>; borderColor?: ReturnType<typeof rgb>; thickness?: number }) {
  page.drawRectangle({
    x, y, width: w, height: h,
    color: opts?.fill,
    borderColor: opts?.borderColor ?? BLACK,
    borderWidth: opts?.thickness ?? 0.5,
  })
}

function label(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size = 6, color = GRAY) {
  page.drawText(text, { x, y, size, font, color })
}

function value(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size = 8, color = BLACK) {
  page.drawText(text, { x, y, size, font, color })
}

function hline(page: PDFPage, x1: number, y: number, x2: number, thickness = 0.5, color = BLACK) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color })
}

function vline(page: PDFPage, x: number, y1: number, y2: number, thickness = 0.5, color = BLACK) {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color })
}

// Split a TIN string and draw it in individual boxes (e.g. 000-000-000-000)
function drawTinBoxes(page: PDFPage, font: PDFFont, tin: string, startX: number, y: number) {
  const digits = tin.replace(/\D/g, '')
  const boxW = 14
  for (let i = 0; i < 12; i++) {
    box(page, startX + i * (boxW + 1), y, boxW, 14)
    if (digits[i]) {
      value(page, font, digits[i], startX + i * (boxW + 1) + 4, y + 3, 8)
    }
  }
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export async function generateBir1601cPdf(data: BIR1601CData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Page size: A4 (595.28 × 841.89 pt) — use letter-ish
  const W = 612, H = 936
  const page = pdfDoc.addPage([W, H])
  let y = H - 20

  // ── Outer border ──────────────────────────────────────────────────────────
  box(page, 20, 20, W - 40, H - 40, { thickness: 1 })

  // ── Top header bar ────────────────────────────────────────────────────────
  box(page, 20, H - 70, W - 40, 50, { fill: RED, borderColor: RED })
  page.drawText('BIR Form No.', { x: 30, y: H - 40, size: 7, font: fontR, color: WHITE })
  page.drawText('1601-C', { x: 30, y: H - 52, size: 14, font: fontB, color: WHITE })
  page.drawText('January 2018 (ENCS)', { x: 30, y: H - 63, size: 6, font: fontR, color: WHITE })

  page.drawText('Monthly Remittance Return of Income Taxes Withheld on Compensation', {
    x: 140, y: H - 45, size: 11, font: fontB, color: WHITE,
  })
  page.drawText('(Under the Provisions of the National Internal Revenue Code)', {
    x: 155, y: H - 58, size: 7, font: fontR, color: WHITE,
  })

  // BIR right side
  page.drawText('Bureau of Internal Revenue', { x: W - 200, y: H - 42, size: 8, font: fontB, color: WHITE })
  page.drawText('BIR.GOV.PH', { x: W - 185, y: H - 55, size: 7, font: fontR, color: WHITE })

  y = H - 80

  // ── Part I – Background Information ──────────────────────────────────────
  box(page, 20, y - 14, W - 40, 14, { fill: LGRAY })
  page.drawText('PART I  –  BACKGROUND INFORMATION', { x: 28, y: y - 11, size: 8, font: fontB, color: BLACK })
  y -= 14

  // Row: Line 1 (TIN) | Line 2 (RDO) | Line 3 (Classification)
  const rowH = 28
  box(page, 20, y - rowH, 220, rowH)
  box(page, 240, y - rowH, 120, rowH)
  box(page, 360, y - rowH, W - 380, rowH)

  label(page, fontR, '1  Taxpayer Identification Number (TIN)', 24, y - 8)
  drawTinBoxes(page, fontR, data.tin, 24, y - rowH + 4)

  label(page, fontR, '2  RDO Code', 244, y - 8)
  label(page, fontR, '3  Line of Business', 364, y - 8)
  value(page, fontB, '', 244, y - rowH + 10, 8)
  y -= rowH

  // Row: Taxpayer name
  box(page, 20, y - rowH, W - 40, rowH)
  label(page, fontR, '4  Taxpayer\'s Name (Last Name, First Name, Middle Name / Registered Name)', 24, y - 8)
  value(page, fontB, data.companyName, 24, y - 22, 9)
  y -= rowH

  // Row: Registered address
  box(page, 20, y - rowH, W - 40 - 100, rowH)
  box(page, W - 120, y - rowH, 100, rowH)
  label(page, fontR, '5  Registered Address', 24, y - 8)
  value(page, fontB, data.address, 24, y - 22, 8)
  label(page, fontR, '6  Zip Code', W - 116, y - 8)
  y -= rowH

  // Row: Period & amended
  box(page, 20, y - rowH, 200, rowH)
  box(page, 220, y - rowH, 160, rowH)
  box(page, 380, y - rowH, W - 400, rowH)

  label(page, fontR, '7  For the Month of:', 24, y - 8)
  value(page, fontB, data.month, 24, y - 22, 9)

  label(page, fontR, '8  Amended Return?', 224, y - 8)
  label(page, fontR, '[ ] Yes   [ ] No', 224, y - 20, 8)

  label(page, fontR, '9  No. of Sheet(s) Attached', 384, y - 8)
  y -= rowH

  // ── Part II – Computation of Tax ─────────────────────────────────────────
  box(page, 20, y - 14, W - 40, 14, { fill: LGRAY })
  page.drawText('PART II  –  COMPUTATION OF TAX', { x: 28, y: y - 11, size: 8, font: fontB, color: BLACK })
  y -= 14

  // Column headers for Part II
  const col1 = 20, col2 = W - 180, col3 = W - 80
  const thH = 22
  box(page, col1, y - thH, col2 - col1, thH, { fill: LGRAY })
  box(page, col2, y - thH, col3 - col2, thH, { fill: LGRAY })
  box(page, col3, y - thH, W - 20 - col3, thH, { fill: LGRAY })
  page.drawText('Particulars', { x: col1 + 4, y: y - 14, size: 7, font: fontB, color: BLACK })
  page.drawText('Amount of Compensation', { x: col2 + 4, y: y - 10, size: 6, font: fontB, color: BLACK })
  page.drawText('(Column A)', { x: col2 + 4, y: y - 18, size: 6, font: fontR, color: BLACK })
  page.drawText('Tax Required to be', { x: col3 + 4, y: y - 10, size: 6, font: fontB, color: BLACK })
  page.drawText('Withheld (Column B)', { x: col3 + 4, y: y - 18, size: 6, font: fontB, color: BLACK })
  y -= thH

  const lineH = 20
  const taxLines = [
    { num: '10', label: 'Regular Employees (Minimum Wage Earners excluded)', comp: data.totalCompensation, tax: data.totalTaxWithheld },
    { num: '11', label: 'Minimum Wage Earners (MWE) including Holiday Pay, Overtime Pay,\n        Night Shift Differential Pay and Hazard Pay', comp: 0, tax: 0 },
    { num: '12', label: 'Total (Sum of Items 10 and 11)', comp: data.totalCompensation, tax: data.totalTaxWithheld, bold: true },
  ]

  for (const line of taxLines) {
    const h = line.label.includes('\n') ? lineH + 10 : lineH
    box(page, col1, y - h, col2 - col1, h)
    box(page, col2, y - h, col3 - col2, h)
    box(page, col3, y - h, W - 20 - col3, h)

    const font_ = line.bold ? fontB : fontR
    const textY = y - (h > lineH ? 10 : 13)

    value(page, font_, `${line.num}  ${line.label.split('\n')[0]}`, col1 + 4, textY, 7)
    if (line.label.includes('\n')) {
      value(page, fontR, line.label.split('\n')[1], col1 + 4, textY - 9, 7)
    }

    if (line.comp) {
      value(page, font_, fmt(line.comp), col2 + col3 - col2 - 6 - fmt(line.comp).length * 4.5, y - h / 2 - 4, 8)
    }
    if (line.tax) {
      value(page, font_, fmt(line.tax), col3 + (W - 20 - col3) - 6 - fmt(line.tax).length * 4.5, y - h / 2 - 4, 8)
    }
    y -= h
  }

  // Tax adjustments
  const adjLines = [
    { num: '13', label: 'Less: Tax Remitted in Return Previously Filed, if this is an amended return' },
    { num: '14', label: 'Tax Still Due / (Overremittance)  (Item 12 Column B minus Item 13)', value: data.totalTaxWithheld, bold: true },
    { num: '15', label: 'Add: Penalties' },
    { num: '15A', label: '     Surcharge' },
    { num: '15B', label: '     Interest' },
    { num: '15C', label: '     Compromise' },
    { num: '16', label: 'Total Amount Still Due / (Overremittance)  (Sum of Items 14 and 15)', value: data.totalTaxWithheld, bold: true },
  ]

  for (const line of adjLines) {
    box(page, col1, y - lineH, col2 - col1, lineH)
    box(page, col2, y - lineH, col3 - col2, lineH)
    box(page, col3, y - lineH, W - 20 - col3, lineH)
    const font_ = line.bold ? fontB : fontR
    value(page, font_, `${line.num}  ${line.label}`, col1 + 4, y - 13, 7)
    if (line.value) {
      value(page, font_, fmt(line.value), col3 + (W - 20 - col3) - 6 - fmt(line.value).length * 4.5, y - 13, 8)
    }
    y -= lineH
  }

  y -= 6

  // ── Schedule 1 – Alphalist ────────────────────────────────────────────────
  box(page, 20, y - 14, W - 40, 14, { fill: LGRAY })
  page.drawText('SCHEDULE 1  –  ALPHALIST OF EMPLOYEES', { x: 28, y: y - 11, size: 8, font: fontB, color: BLACK })
  y -= 14

  // Table headers
  const cols = [
    { label: 'Seq\n#', x: 20,  w: 28 },
    { label: 'TIN', x: 48,  w: 90 },
    { label: 'Last Name', x: 138, w: 100 },
    { label: 'First Name', x: 238, w: 95 },
    { label: 'Middle\nName', x: 333, w: 70 },
    { label: 'Monthly\nCompensation', x: 403, w: 100 },
    { label: 'Tax\nWithheld', x: 503, w: W - 40 - 503 + 20 },
  ]

  const tHeadH = 24
  for (const c of cols) {
    box(page, c.x, y - tHeadH, c.w, tHeadH, { fill: LGRAY })
    const lines = c.label.split('\n')
    if (lines.length === 1) {
      page.drawText(c.label, { x: c.x + 3, y: y - 15, size: 6, font: fontB, color: BLACK })
    } else {
      page.drawText(lines[0], { x: c.x + 3, y: y - 11, size: 6, font: fontB, color: BLACK })
      page.drawText(lines[1], { x: c.x + 3, y: y - 20, size: 6, font: fontB, color: BLACK })
    }
  }
  y -= tHeadH

  const rowHt = 14
  // Check if we need a second page
  let currentPage = page
  const addPageIfNeeded = (neededY: number) => {
    if (neededY < 60) {
      const newPage = pdfDoc.addPage([W, H])
      box(newPage, 20, 20, W - 40, H - 40, { thickness: 1 })
      // Continuation header
      box(newPage, 20, H - 30, W - 40, 30, { fill: RED, borderColor: RED })
      newPage.drawText('BIR Form 1601-C  –  Schedule 1 Alphalist (Continued)', {
        x: 28, y: H - 20, size: 9, font: fontB, color: WHITE,
      })
      // Re-draw column headers
      let ny = H - 30
      for (const c of cols) {
        box(newPage, c.x, ny - tHeadH, c.w, tHeadH, { fill: LGRAY })
        const lines = c.label.split('\n')
        if (lines.length === 1) {
          newPage.drawText(c.label, { x: c.x + 3, y: ny - 15, size: 6, font: fontB, color: BLACK })
        } else {
          newPage.drawText(lines[0], { x: c.x + 3, y: ny - 11, size: 6, font: fontB, color: BLACK })
          newPage.drawText(lines[1], { x: c.x + 3, y: ny - 20, size: 6, font: fontB, color: BLACK })
        }
      }
      currentPage = newPage
      return ny - tHeadH
    }
    return neededY
  }

  for (let i = 0; i < data.employees.length; i++) {
    y = addPageIfNeeded(y - rowHt)
    const emp = data.employees[i]
    for (const c of cols) {
      box(currentPage, c.x, y, c.w, rowHt)
    }
    value(currentPage, fontR, String(i + 1), 27, y + 4, 7)
    value(currentPage, fontR, emp.tin || '', 50, y + 4, 7)
    value(currentPage, fontR, emp.lastName.substring(0, 14), 140, y + 4, 7)
    value(currentPage, fontR, emp.firstName.substring(0, 13), 240, y + 4, 7)
    value(currentPage, fontR, (emp.middleName || '').substring(0, 9), 335, y + 4, 7)
    const compStr = fmt(emp.compensation)
    value(currentPage, fontR, compStr, 503 - 3 - compStr.length * 4.3, y + 4, 7)
    const taxStr = fmt(emp.taxWithheld)
    value(currentPage, fontR, taxStr, W - 20 - 3 - taxStr.length * 4.3, y + 4, 7)
    y += rowHt
    if (i < data.employees.length - 1) y -= rowHt  // next iteration will add row
    else y = y  // keep last y after drawing
    // undo the y manipulation — just set y to the row bottom
    y = y - rowHt + rowHt  // no-op; clean reset
  }
  // After loop, y is at top of last drawn row. Move to bottom of last row.
  y -= 0

  // Totals row
  y = addPageIfNeeded(y - rowHt * 2)
  for (const c of cols) {
    box(currentPage, c.x, y, c.w, rowHt, { fill: LGRAY })
  }
  currentPage.drawText('TOTALS', { x: 140, y: y + 4, size: 7, font: fontB, color: BLACK })
  const totalComp = fmt(data.totalCompensation)
  const totalTax  = fmt(data.totalTaxWithheld)
  currentPage.drawText(totalComp, { x: 503 - 3 - totalComp.length * 4.3, y: y + 4, size: 7, font: fontB, color: BLACK })
  currentPage.drawText(totalTax,  { x: W - 20 - 3 - totalTax.length * 4.3, y: y + 4, size: 7, font: fontB, color: BLACK })
  y -= rowHt

  y -= 10

  // ── Certification ─────────────────────────────────────────────────────────
  if (y < 120) {
    const sigPage = pdfDoc.addPage([W, H])
    box(sigPage, 20, 20, W - 40, H - 40, { thickness: 1 })
    currentPage = sigPage
    y = H - 40
  }

  box(currentPage, 20, y - 60, W - 40, 60)
  currentPage.drawText(
    'I declare, under the penalties of perjury, that this return has been made in good faith, verified by me, and to the best of my knowledge\n' +
    'and belief, is true, correct, and complete. (Per Section 267, NIRC, as amended, a false and fraudulent return shall be subject to the\n' +
    'penalties provided under Section 255 and 267 of the National Internal Revenue Code of 1997, as amended)',
    { x: 28, y: y - 14, size: 6.5, font: fontR, color: BLACK, lineHeight: 9 }
  )
  hline(currentPage, 30, y - 40, 200, 0.5)
  currentPage.drawText('Signature over Printed Name of Authorized Officer', { x: 30, y: y - 50, size: 6, font: fontR, color: GRAY })
  hline(currentPage, 220, y - 40, 380, 0.5)
  currentPage.drawText('TIN', { x: 220, y: y - 50, size: 6, font: fontR, color: GRAY })
  hline(currentPage, 400, y - 40, 580, 0.5)
  currentPage.drawText('Date', { x: 400, y: y - 50, size: 6, font: fontR, color: GRAY })
  y -= 60

  // ── Footer ────────────────────────────────────────────────────────────────
  currentPage.drawText(
    `BIR Form No. 1601-C  |  Generated: ${new Date().toLocaleDateString('en-PH')}  |  For the period: ${data.month}`,
    { x: 28, y: 28, size: 6, font: fontR, color: GRAY }
  )

  return pdfDoc.save()
}
