import { z } from 'zod'
export const paperSizeSchema = z.enum(['A4','LETTER','LEGAL','LONG','A5']).default('A4')
export const paperSizes = {
 A4: {label:'A4', dimensions:'210 × 297 mm', width:210, height:297},
 LETTER: {label:'Letter / Short bond', dimensions:'8.5 × 11 in', width:215.9, height:279.4},
 LEGAL: {label:'Legal', dimensions:'8.5 × 14 in', width:215.9, height:355.6},
 LONG: {label:'Long bond', dimensions:'8.5 × 13 in', width:215.9, height:330.2},
 A5: {label:'A5', dimensions:'148 × 210 mm', width:148, height:210},
} as const
export function readPaperSize(value:unknown):keyof typeof paperSizes {
 const parsed=paperSizeSchema.safeParse(value)
 return parsed.success?parsed.data:'A4'
}
export function documentPageCss(value:unknown) {
 const paper=paperSizes[readPaperSize(value)]
 return `@page{size:${paper.width}mm ${paper.height}mm;margin:18mm}`
}
