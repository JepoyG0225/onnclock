/**
 * BIR Form 1604CF — Annual Information Return of Income Taxes Withheld on Compensation
 * Generated as a filled PDF mimicking the official BIR form layout.
 */
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'

export interface AlphalistEmployee {
  seq: number
  tin: string
  lastName: string
  firstName: string
  middleName: string
  dateOfBirth: string
  statusOfEmployment: string  // 'P' = present, 'R' = resigned
  regularCompensation: number
  supplementaryCompensation: number
  totalCompensation: number
  taxWithheld: number
  annualTaxDue: number
  taxRefund?: number
}

export interface BIR1604CFData {
  companyName: string
  tin: string
  address: string
  year: number
  employees: AlphalistEmployee[]
}

const BLACK = rgb(0, 0, 0)
const GRAY  = rgb(0.5, 0.5, 0.5)
const LGRAY = rgb(0.88, 0.88, 0.88)
const DKRED = rgb(0.6, 0.05, 0.05)
const WHITE = rgb(1, 1, 1)

function fmt(n: number) {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function box(page: PDFPage, x: number, y: number, w: number, h: number, opts?: { fill?: ReturnType<typeof rgb>; borderColor?: ReturnType<typeof rgb>; thickness?: number }) {
  page.drawRectangle({ x, y, width: w, height: h, color: opts?.fill, borderColor: opts?.borderColor ?? BLACK, borderWidth: opts?.thickness ?? 0.5 })
}

function txt(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size = 8, color = BLACK) {
  page.drawText(text, { x, y, size, font, color })
}

function drawTinBoxes(page: PDFPage, font: PDFFont, tin: string, startX: number, y: number) {
  const digits = tin.replace(/\D/g, '')
  const boxW = 13
  for (let i = 0; i < 12; i++) {
    box(page, startX + i * (boxW + 1), y, boxW, 13)
    if (digits[i]) txt(page, font, digits[i], startX + i * (boxW + 1) + 3, y + 2, 8)
  }
}

const W = 842, H = 595  // Landscape A4

function buildMainPage(pdfDoc: PDFDocument, fontR: PDFFont, fontB: PDFFont, data: BIR1604CFData): PDFPage {
  const page = pdfDoc.addPage([W, H])

  // Outer border
  box(page, 15, 15, W - 30, H - 30, { thickness: 1 })

  // Header
  box(page, 15, H - 75, W - 30, 60, { fill: DKRED, borderColor: DKRED })
  txt(page, fontR, 'BIR Form No.', 25, H - 42, 7, WHITE)
  txt(page, fontB, '1604-CF', 25, H - 56, 15, WHITE)
  txt(page, fontR, 'January 2018 (ENCS)', 25, H - 68, 6, WHITE)

  txt(page, fontB, 'Annual Information Return of Income Taxes Withheld on Compensation', 160, H - 45, 11, WHITE)
  txt(page, fontR, 'and Final Withholding Taxes', 250, H - 58, 9, WHITE)
  txt(page, fontR, '(Under the Provisions of the National Internal Revenue Code)', 215, H - 70, 7, WHITE)

  txt(page, fontB, 'Bureau of Internal Revenue', W - 210, H - 45, 8, WHITE)
  txt(page, fontR, 'BIR.GOV.PH', W - 195, H - 57, 7, WHITE)

  let y = H - 85

  // Part I header
  box(page, 15, y - 14, W - 30, 14, { fill: LGRAY })
  txt(page, fontB, 'PART I  –  BACKGROUND INFORMATION', 22, y - 11, 8)
  y -= 14

  // TIN row
  const rH = 26
  box(page, 15, y - rH, 230, rH)
  box(page, 245, y - rH, 130, rH)
  box(page, 375, y - rH, W - 390, rH)
  txt(page, fontR, '1  Taxpayer Identification Number (TIN)', 20, y - 9, 6, GRAY)
  drawTinBoxes(page, fontR, data.tin, 20, y - rH + 4)
  txt(page, fontR, '2  RDO Code', 250, y - 9, 6, GRAY)
  txt(page, fontR, '3  Line of Business', 380, y - 9, 6, GRAY)
  y -= rH

  box(page, 15, y - rH, W - 30, rH)
  txt(page, fontR, '4  Employer\'s Name (Last Name, First Name, Middle Name / Registered Name)', 20, y - 9, 6, GRAY)
  txt(page, fontB, data.companyName, 20, y - 21, 9)
  y -= rH

  box(page, 15, y - rH, W - 130, rH)
  box(page, W - 115, y - rH, 100, rH)
  txt(page, fontR, '5  Registered Address', 20, y - 9, 6, GRAY)
  txt(page, fontB, data.address, 20, y - 21, 8)
  txt(page, fontR, '6  Zip Code', W - 110, y - 9, 6, GRAY)
  y -= rH

  box(page, 15, y - rH, 160, rH)
  box(page, 175, y - rH, 160, rH)
  box(page, 335, y - rH, W - 350, rH)
  txt(page, fontR, '7  Taxable Year:', 20, y - 9, 6, GRAY)
  txt(page, fontB, String(data.year), 20, y - 21, 10)
  txt(page, fontR, '8  Amended Return?  [ ] Yes  [ ] No', 180, y - 9, 6, GRAY)
  txt(page, fontR, '9  No. of Sheet(s) Attached', 340, y - 9, 6, GRAY)
  y -= rH

  // Part II — Summary
  box(page, 15, y - 14, W - 30, 14, { fill: LGRAY })
  txt(page, fontB, 'PART II  –  SUMMARY', 22, y - 11, 8)
  y -= 14

  const summaryLines = [
    { num: '10', label: 'Total Compensation (Sum of Annex A Column 7)', value: data.employees.reduce((s, e) => s + e.totalCompensation, 0) },
    { num: '11', label: 'Total Tax Required to be Withheld (Sum of Annex A Column 10)', value: data.employees.reduce((s, e) => s + e.annualTaxDue, 0) },
    { num: '12', label: 'Total Taxes Withheld (Sum of Annex A Column 9)', value: data.employees.reduce((s, e) => s + e.taxWithheld, 0) },
    { num: '13', label: 'Total Tax Refunded (Sum of Annex A Column 11)', value: data.employees.reduce((s, e) => s + (e.taxRefund ?? 0), 0) },
  ]

  const lH = 18
  const valX = W - 180
  for (const line of summaryLines) {
    box(page, 15, y - lH, valX - 15, lH)
    box(page, valX, y - lH, W - 30 - valX + 15, lH)
    txt(page, fontR, `${line.num}  ${line.label}`, 22, y - 13, 7)
    const vs = fmt(line.value)
    txt(page, fontB, vs, W - 20 - vs.length * 4.5, y - 13, 8)
    y -= lH
  }

  y -= 10

  // Certification
  box(page, 15, y - 55, W - 30, 55)
  txt(page, fontR,
    'I declare, under the penalties of perjury, that this return has been made in good faith, verified by me, and to the best of my knowledge and belief, is',
    22, y - 14, 6.5)
  txt(page, fontR,
    'belief, is true, correct, and complete. (Per Section 267, NIRC, as amended, a false and fraudulent return shall be subject to the penalties provided)',
    22, y - 23, 6.5)
  txt(page, fontR,
    'under Section 255 and 267 of the National Internal Revenue Code of 1997, as amended)',
    22, y - 32, 6.5)

  page.drawLine({ start: { x: 25, y: y - 44 }, end: { x: 220, y: y - 44 }, thickness: 0.5, color: BLACK })
  txt(page, fontR, 'Signature over Printed Name of Authorized Officer', 25, y - 52, 6, GRAY)
  page.drawLine({ start: { x: 240, y: y - 44 }, end: { x: 420, y: y - 44 }, thickness: 0.5, color: BLACK })
  txt(page, fontR, 'TIN', 240, y - 52, 6, GRAY)
  page.drawLine({ start: { x: 440, y: y - 44 }, end: { x: 620, y: y - 44 }, thickness: 0.5, color: BLACK })
  txt(page, fontR, 'Date Signed', 440, y - 52, 6, GRAY)

  txt(page, fontR,
    `BIR Form No. 1604-CF  |  Taxable Year: ${data.year}  |  Generated: ${new Date().toLocaleDateString('en-PH')}`,
    22, 22, 6, GRAY)

  return page
}

function buildAlphalistPage(pdfDoc: PDFDocument, fontR: PDFFont, fontB: PDFFont, data: BIR1604CFData, employees: AlphalistEmployee[], pageNum: number): { page: PDFPage; lastY: number } {
  const page = pdfDoc.addPage([W, H])
  box(page, 15, 15, W - 30, H - 30, { thickness: 1 })

  // Header
  box(page, 15, H - 50, W - 30, 35, { fill: DKRED, borderColor: DKRED })
  txt(page, fontB, `BIR Form 1604-CF  –  Annex A: Alphalist of Employees${pageNum > 1 ? ' (Continued)' : ''}`, 22, H - 32, 9, WHITE)
  txt(page, fontR, `Employer: ${data.companyName}   |   TIN: ${data.tin}   |   Taxable Year: ${data.year}`, 22, H - 44, 7, WHITE)

  let y = H - 50

  // Column definitions
  const cols = [
    { label: 'Seq\n#',      x: 15,  w: 25 },
    { label: 'TIN',          x: 40,  w: 80 },
    { label: 'Last Name',    x: 120, w: 90 },
    { label: 'First Name',   x: 210, w: 85 },
    { label: 'Middle\nName', x: 295, w: 60 },
    { label: 'Birth Date',   x: 355, w: 60 },
    { label: 'S',            x: 415, w: 18 },
    { label: 'Regular\nComp', x: 433, w: 90 },
    { label: 'Suppl.\nComp',  x: 523, w: 80 },
    { label: 'Total\nComp',   x: 603, w: 90 },
    { label: 'Tax\nWithheld', x: 693, w: 75 },
    { label: 'Tax\nDue',      x: 768, w: W - 30 - 768 + 15 },
  ]

  const thH = 26
  for (const c of cols) {
    box(page, c.x, y - thH, c.w, thH, { fill: LGRAY })
    const lines = c.label.split('\n')
    if (lines.length === 1) {
      txt(page, fontB, c.label, c.x + 2, y - 16, 5.5)
    } else {
      txt(page, fontB, lines[0], c.x + 2, y - 11, 5.5)
      txt(page, fontB, lines[1], c.x + 2, y - 20, 5.5)
    }
  }
  y -= thH

  const rH = 13
  for (const emp of employees) {
    for (const c of cols) box(page, c.x, y - rH, c.w, rH)
    txt(page, fontR, String(emp.seq), 17, y - 10, 6)
    txt(page, fontR, emp.tin || '', 42, y - 10, 6)
    txt(page, fontR, emp.lastName.substring(0, 13), 122, y - 10, 6)
    txt(page, fontR, emp.firstName.substring(0, 12), 212, y - 10, 6)
    txt(page, fontR, (emp.middleName || '').substring(0, 8), 297, y - 10, 6)
    txt(page, fontR, emp.dateOfBirth || '', 357, y - 10, 6)
    txt(page, fontB, emp.statusOfEmployment || 'P', 418, y - 10, 6)

    const regS = fmt(emp.regularCompensation)
    txt(page, fontR, regS, 523 - 3 - regS.length * 3.7, y - 10, 6)
    const supS = fmt(emp.supplementaryCompensation)
    txt(page, fontR, supS, 603 - 3 - supS.length * 3.7, y - 10, 6)
    const totS = fmt(emp.totalCompensation)
    txt(page, fontR, totS, 693 - 3 - totS.length * 3.7, y - 10, 6)
    const twhS = fmt(emp.taxWithheld)
    txt(page, fontR, twhS, 768 - 3 - twhS.length * 3.7, y - 10, 6)
    const tdueS = fmt(emp.annualTaxDue)
    txt(page, fontR, tdueS, W - 15 - 3 - tdueS.length * 3.7, y - 10, 6)

    y -= rH
  }

  // Footer
  txt(page, fontR, `Page ${pageNum}  –  BIR 1604-CF Alphalist  |  Taxable Year: ${data.year}`, 22, 22, 6, GRAY)

  return { page, lastY: y }
}

export async function generateBir1604cfPdf(data: BIR1604CFData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Page 1: Main form
  buildMainPage(pdfDoc, fontR, fontB, data)

  // Alphalist pages — up to ~28 rows per page (landscape A4 with headers)
  const ROWS_PER_PAGE = 28
  const chunks: AlphalistEmployee[][] = []
  for (let i = 0; i < data.employees.length; i += ROWS_PER_PAGE) {
    chunks.push(data.employees.slice(i, i + ROWS_PER_PAGE))
  }

  if (chunks.length === 0) chunks.push([]) // at least one page

  chunks.forEach((chunk, idx) => buildAlphalistPage(pdfDoc, fontR, fontB, data, chunk, idx + 1))

  // Totals page if more than 1 chunk, or append totals to last page
  const totPage = pdfDoc.addPage([W, H])
  box(totPage, 15, 15, W - 30, H - 30, { thickness: 1 })
  box(totPage, 15, H - 50, W - 30, 35, { fill: DKRED, borderColor: DKRED })
  totPage.drawText('BIR Form 1604-CF  –  Annex A: Summary of Totals', { x: 22, y: H - 32, size: 9, font: fontB, color: WHITE })
  totPage.drawText(`Employer: ${data.companyName}   |   TIN: ${data.tin}   |   Taxable Year: ${data.year}`, { x: 22, y: H - 44, size: 7, font: fontR, color: WHITE })

  let sy = H - 60
  const totals = {
    regularComp: data.employees.reduce((s, e) => s + e.regularCompensation, 0),
    supplComp: data.employees.reduce((s, e) => s + e.supplementaryCompensation, 0),
    totalComp: data.employees.reduce((s, e) => s + e.totalCompensation, 0),
    taxWithheld: data.employees.reduce((s, e) => s + e.taxWithheld, 0),
    taxDue: data.employees.reduce((s, e) => s + e.annualTaxDue, 0),
    taxRefund: data.employees.reduce((s, e) => s + (e.taxRefund ?? 0), 0),
  }

  box(totPage, 15, sy - 14, W - 30, 14, { fill: LGRAY })
  totPage.drawText('CONSOLIDATED TOTALS', { x: 22, y: sy - 11, size: 9, font: fontB, color: BLACK })
  sy -= 14

  const totLines = [
    { label: 'Total Number of Employees', value: String(data.employees.length) },
    { label: 'Total Regular Compensation', value: fmt(totals.regularComp) },
    { label: 'Total Supplementary Compensation', value: fmt(totals.supplComp) },
    { label: 'TOTAL COMPENSATION', value: fmt(totals.totalComp), bold: true },
    { label: 'Total Tax Withheld', value: fmt(totals.taxWithheld) },
    { label: 'TOTAL ANNUAL TAX DUE', value: fmt(totals.taxDue), bold: true },
    { label: 'Total Tax Refunded', value: fmt(totals.taxRefund) },
    { label: 'Net Tax Remitted  (Total Tax Withheld - Tax Refunded)', value: fmt(totals.taxWithheld - totals.taxRefund), bold: true },
  ]

  for (const line of totLines) {
    const h = 22
    box(totPage, 15, sy - h, W - 200, h, { fill: line.bold ? LGRAY : WHITE })
    box(totPage, W - 215, sy - h, 200, h, { fill: line.bold ? LGRAY : WHITE })
    const f = line.bold ? fontB : fontR
    totPage.drawText(line.label, { x: 22, y: sy - 15, size: 8, font: f, color: BLACK })
    totPage.drawText(line.value, { x: W - 215 + (200 - line.value.length * 5) - 6, y: sy - 15, size: 8, font: f, color: BLACK })
    sy -= h
  }

  totPage.drawText(
    `BIR Form No. 1604-CF  |  Taxable Year: ${data.year}  |  Generated: ${new Date().toLocaleDateString('en-PH')}`,
    { x: 22, y: 22, size: 6, font: fontR, color: GRAY }
  )

  return pdfDoc.save()
}
