import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fillCertificateText, type CertificateSnapshot } from './certificate-template'
import { certificateFont } from './certificate-fonts'

export async function renderCertificate(template: CertificateSnapshot, background: Uint8Array, values: Record<string, string>) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const embeddedFonts = new Map<string, PDFFont>()
  const image = template.backgroundMime === 'image/png' ? await doc.embedPng(background) : await doc.embedJpg(background)
  const page = doc.addPage([template.width, template.height])
  page.drawImage(image, { x: 0, y: 0, width: template.width, height: template.height })
  for (const field of template.fields) {
    const choice = certificateFont(field.fontFamily)
    const file = field.bold && choice.bold ? choice.bold : choice.regular
    let font = embeddedFonts.get(file)
    if (!font) {
      font = await doc.embedFont(await readFile(path.join(process.cwd(), 'public/fonts/certificates', file)), { subset: true })
      embeddedFonts.set(file, font)
    }
    const text = fillCertificateText(field.text, values)
    const width = template.width * field.width / 100
    const measured = font.widthOfTextAtSize(text, field.fontSize)
    const fontSize = measured > width ? field.fontSize * width / measured : field.fontSize
    const actualWidth = font.widthOfTextAtSize(text, fontSize)
    const x = template.width * field.x / 100 + (field.align === 'center' ? (width - actualWidth) / 2 : field.align === 'right' ? width - actualWidth : 0)
    const y = template.height * (1 - field.y / 100) - fontSize
    if (y < 0) throw new Error('A text field extends below the certificate. Move it up before saving.')
    const color = field.color.slice(1)
    page.drawText(text, { x, y, size: fontSize, font, color: rgb(parseInt(color.slice(0, 2), 16) / 255, parseInt(color.slice(2, 4), 16) / 255, parseInt(color.slice(4, 6), 16) / 255) })
  }
  return doc.save()
}
