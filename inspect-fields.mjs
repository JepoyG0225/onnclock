import { PDFDocument } from 'pdf-lib'
import fs from 'fs'

const bytes = fs.readFileSync('public/templates/2316 Sep 2021 ENCS.pdf')
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
const form = doc.getForm()
const fields = form.getFields()

const results = []
for (const field of fields) {
  const name = field.getName()
  const type = field.constructor.name
  const widgets = field.acroField.getWidgets()
  for (const w of widgets) {
    const rect = w.getRectangle()
    results.push({ name, type, x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) })
  }
}

results.sort((a, b) => b.y - a.y || a.x - b.x)
for (const r of results) {
  console.log(`${r.type.padEnd(15)} x:${String(r.x).padStart(4)} y:${String(r.y).padStart(4)} w:${String(r.w).padStart(4)} h:${String(r.h).padStart(3)}  "${r.name}"`)
}
console.log(`\nTotal fields: ${results.length}`)
