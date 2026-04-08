/**
 * BIR Form 2316 — Certificate of Compensation Payment/Tax Withheld
 * Fills the official "2316 Sep 2021 ENCS.pdf" AcroForm template.
 */
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

export interface Bir2316Data {
  year: number
  employeeName: string
  employeeTin: string
  employeeAddress: string
  employeeZip: string
  employeeBirthDate: string
  employeeContact: string
  employerName: string
  employerTin: string
  employerAddress: string
  employerZip: string
  grossComp: string
  nonTaxable: string
  taxable: string
  taxWithheld: string
  sss: string
  philhealth: string
  pagibig: string
  // Non-taxable breakdown
  basicSalaryNonTaxable: string
  holidayPay: string
  overtimePay: string
  nightDiff: string
  thirteenthMonth: string  // total 13th month — up to 90k is non-taxable
  deMinimis: string
  isMinimumWageEarner?: boolean
  isExemptFromTax?: boolean
}

/** Split TIN string (e.g. "123-456-789-000") into 4 parts */
function splitTin(tin: string): [string, string, string, string] {
  const digits = (tin || '').replace(/\D/g, '')
  if (digits.length === 0) return ['', '', '', '']
  let d = digits
  if (digits.length > 12) d = digits.slice(0, 12)
  if (digits.length < 12) d = digits.padEnd(12, '0')
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 12)]
}

function spacedDigits(input: string): string {
  const digits = (input || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.split('').join(' ')
}

/** Format a numeric string as Philippine peso amount */
function fmtAmt(val: string | number, zeroAsAmount = false): string {
  const n = typeof val === 'number' ? val : parseFloat(val)
  if (isNaN(n) || n === 0) return zeroAsAmount ? '0.00' : ''
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function drawRightAlignedText(
  page: import('pdf-lib').PDFPage,
  font: import('pdf-lib').PDFFont,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  size = 9,
  padRight = 3,
  padY = 1,
) {
  if (!text) return
  const textWidth = font.widthOfTextAtSize(text, size)
  const tx = x + width - textWidth - padRight
  const ty = y + Math.max(0, (height - size) / 2) + padY
  page.drawText(text, { x: tx, y: ty, size, font })
}

export async function generateBir2316Pdf(data: Bir2316Data, debug = false): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), 'public', 'templates', '2316 Sep 2021 ENCS.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
  const form = pdfDoc.getForm()

  const set = (name: string, value: string) => {
    try { form.getTextField(name).setText(value ?? '') } catch { /* skip missing */ }
  }
  const setSafe = (name: string, value: string): boolean => {
    try { form.getTextField(name).setText(value ?? ''); return true } catch { return false }
  }
  const setTinField = (name: string, value: string): boolean => {
    try {
      const field = form.getTextField(name)
      field.setText(value ?? '')
      field.setFontSize(8)
      return true
    } catch {
      return false
    }
  }
  const checkBox = (name: string) => {
    try { form.getCheckBox(name).check() } catch { /* skip missing */ }
  }

  // ── Year & Period ────────────────────────────────────────────────────────────
  set('1For the Year(YYYY)',      spacedDigits(String(data.year)))
  set('2For the PeriodFrom(MM)', spacedDigits('01'))
  set('For the PeriodFrom(DD)',  spacedDigits('01'))
  set('To(MM)',                  spacedDigits('12'))
  set('To(DD)',                  spacedDigits('31'))

  // ── Employee TIN ─────────────────────────────────────────────────────────────
  // Field x-order: "3TIN"(x:86,w:37), "-"(x:136,w:37), "-_1"(x:186,w:37), "-_2"(x:236,w:70)
  const [et1, et2, et3, et4] = splitTin(data.employeeTin)
  const tinOk1 = setTinField('3TIN', spacedDigits(et1))
  const tinOk2 = setTinField('-',    spacedDigits(et2))
  const tinOk3 = setTinField('-_1',  spacedDigits(et3))
  const tinOk4 = setTinField('-_2',  spacedDigits(et4))

  // ── Employee Information ──────────────────────────────────────────────────────
  set("Employee's Name (Last Name, First Name, Middle Name)", data.employeeName)
  set('6 Registered Address6A', data.employeeAddress)
  set('ZIP Code',               data.employeeZip)
  set('7 Date of Birth(MM/DD/YYYY)', data.employeeBirthDate)
  set('8 Contact Number',       data.employeeContact)

  // ── Employer TIN (Present) ────────────────────────────────────────────────────
  // Field x-order: "12TIN"(x:87,w:36), "-_3"(x:137,w:36), "-_4"(x:187,w:36), "-_5"(x:236,w:69)
  const [rt1, rt2, rt3, rt4] = splitTin(data.employerTin)
  set('12TIN', rt1)
  set('-_3',   rt2)
  set('-_4',   rt3)
  set('-_5',   rt4)

  // ── Employer Information (Present) ───────────────────────────────────────────
  set("13 Employer's Name",               data.employerName)
  set('14 Registered Address14A ZIP Code', data.employerAddress)
  set('14A ZIP Code',                     data.employerZip)

  // Mark as Main Employer
  checkBox('CheckBox_7')
  if (data.isMinimumWageEarner || data.isExemptFromTax) {
    // Minimum Wage Earner / Tax Exempt
    checkBox('CheckBox_3')
  }

  // ── Computed values ───────────────────────────────────────────────────────────
  const sssNum        = parseFloat(data.sss              || '0')
  const phNum         = parseFloat(data.philhealth       || '0')
  const piNum         = parseFloat(data.pagibig          || '0')
  const govContrib    = sssNum + phNum + piNum

  const grossNum      = parseFloat(data.grossComp        || '0')
  const nonTaxNum     = parseFloat(data.nonTaxable       || '0')
  const taxableNum    = parseFloat(data.taxable          || '0')
  const taxWHNum      = parseFloat(data.taxWithheld      || '0')

  const thirteenth    = parseFloat(data.thirteenthMonth  || '0')
  const deMinimis     = parseFloat(data.deMinimis        || '0')

  const MAX_13TH      = 90000
  const thirteenthNonTax  = Math.min(thirteenth, MAX_13TH)
  const thirteenthTaxable = Math.max(0, thirteenth - MAX_13TH)

  const nonTaxBasic   = parseFloat(data.basicSalaryNonTaxable || '0')
  const overtimePay   = parseFloat(data.overtimePay           || '0')
  const isMWE         = Boolean(data.isMinimumWageEarner || data.isExemptFromTax)

  // ── Part IV-B A: Non-taxable Compensation ────────────────────────────────────
  set('NON-TAXABLE-Basic Salary',                      fmtAmt(nonTaxBasic, true))
  // Lines 30-33 are for Minimum Wage Earners only
  if (isMWE) {
    set('NON-TAXABLE-Overtime Pay (MWE)', fmtAmt(overtimePay, true))
  } else {
    set('NON-TAXABLE-Overtime Pay (MWE)', fmtAmt(0, true))
  }
  set('NON-TAXABLE-13th Month Pay and Other Benefits', fmtAmt(thirteenthNonTax, true))
  set('De Minimis Benefits',                           fmtAmt(deMinimis, true))
  set('SSS, GSIS, PHIC & PAG-IBIG Contributions',     fmtAmt(govContrib, true))
  set('Total Non-Taxable/Exempt Compensation',         fmtAmt(nonTaxNum, true))

  // ── Part IV-B B: Taxable Compensation ────────────────────────────────────────
  // For MWE: overtime is non-taxable, so don't subtract from taxable basic
  // For non-MWE: overtime is taxable, shown separately under TAXABLE -Overtime Pay
  const taxableOT    = isMWE ? 0 : overtimePay
  const taxableBasic = Math.max(0, taxableNum - thirteenthTaxable - taxableOT)
  set('Taxable-Basic Salary',              fmtAmt(taxableBasic, true))
  if (!isMWE) {
    set('TAXABLE -Overtime Pay',           fmtAmt(overtimePay, true))
  } else {
    set('TAXABLE -Overtime Pay',           fmtAmt(0, true))
  }
  set('Taxable 13th Month Benefits',       fmtAmt(thirteenthTaxable, true))
  set('Total Taxable Compensation Income', fmtAmt(taxableNum, true))

  // ── Part V Summary (Items 19-28) ─────────────────────────────────────────────
  set('Gross Compensation Income from Present Employe',                                          fmtAmt(grossNum, true))
  set('Less: Total Non-Taxable/Exempt Compensation Income from Present Employe',                 fmtAmt(nonTaxNum, true))
  set('Taxable Compensation Income from Present Employer (Item 19 Less Item 20) (From Item 52)', fmtAmt(taxableNum, true))
  // Items 21 & 22: Previous employer taxable compensation (not tracked) â€” set to 0.00
  set('Add: Taxable Compensation Income from Previous Employer, if applicable',                 '')
  // Item 23: Gross Taxable Compensation Income (Sum of Items 21 and 22)
  set('Total Taxable Compensation Income',                                                      fmtAmt(taxableNum, true))
  set('Tax Due',                                       fmtAmt(taxWHNum, true))
  set('Amount of Taxes Withheld - Present',            fmtAmt(taxWHNum, true))
  set('Total Amount of Taxes Withheld as adjusted',    fmtAmt(taxWHNum, true))
  set('Total Taxes Withheld (Sum of Items 26 and 27)', fmtAmt(taxWHNum, true))

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  form.updateFieldAppearances(font)

  // If Items 22 & 23 share the same field name, render Item 23 manually in its lower widget box
  try {
    const prevField = form.getTextField('Add: Taxable Compensation Income from Previous Employer, if applicable')
    const widgets = prevField.acroField.getWidgets()
    const prevVal = fmtAmt(0, true)
    const grossTaxable = fmtAmt(taxableNum, true)
    if (widgets.length > 0) {
      const rect0 = widgets[0].getRectangle()
      drawRightAlignedText(pdfDoc.getPage(0), font, prevVal, rect0.x, rect0.y, rect0.width, rect0.height, 8, 5, 0)
    }
    if (widgets.length > 1) {
      const rect1 = widgets[1].getRectangle()
      drawRightAlignedText(pdfDoc.getPage(0), font, grossTaxable, rect1.x, rect1.y, rect1.width, rect1.height, 8, 5, 0)
    }
  } catch { /* ignore */ }

  if (debug) {
    const page = pdfDoc.getPage(0)
    const dbgFont = font
    const { width, height } = page.getSize()
    for (let x = 0; x <= width; x += 50) {
      page.drawLine({ start: { x, y: 0 }, end: { x, y: height }, thickness: 0.3, color: rgb(0.8, 0.2, 0.2) })
      page.drawText(String(x), { x: x + 1, y: 5, size: 5, font: dbgFont, color: rgb(0.8, 0.2, 0.2) })
    }
    for (let y = 0; y <= height; y += 50) {
      page.drawLine({ start: { x: 0, y }, end: { x: width, y }, thickness: 0.3, color: rgb(0.2, 0.2, 0.8) })
      page.drawText(String(y), { x: 1, y: y + 1, size: 5, font: dbgFont, color: rgb(0.2, 0.2, 0.8) })
    }
  }

  return pdfDoc.save({ updateFieldAppearances: false })
}
