import { z } from 'zod'

export const headerImage = z.string().max(1_000_000).regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/, 'Upload a PNG or JPEG header image.').or(z.literal(''))
export const documentHeaderSchema = z.object({
  enabled: z.boolean().default(false),
  text: z.string().trim().max(1500).default(''),
  image: headerImage.default(''),
  alignment: z.enum(['left', 'center', 'right']).default('center'),
}).default({ enabled: false, text: '', image: '', alignment: 'center' })
export type DocumentHeaderData = z.infer<typeof documentHeaderSchema>
export function readDocumentHeader(value: unknown): DocumentHeaderData {
  const parsed = documentHeaderSchema.safeParse(value)
  return parsed.success ? parsed.data : { enabled: false, text: '', image: '', alignment: 'center' }
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
export function documentHeaderHtml(value: unknown, position: 'header' | 'footer' = 'header') {
  const header = readDocumentHeader(value)
  if (!header.enabled) return ''
  return `<${position} style="text-align:${header.alignment};border-${position === 'footer' ? 'top' : 'bottom'}:1px solid #cbd5e1;padding-${position === 'footer' ? 'top' : 'bottom'}:20px;margin:24px 0;break-inside:avoid">${header.image ? `<img src="${escape(header.image)}" alt="Company ${position}" style="max-width:100%;max-height:160px;object-fit:contain"/>` : ''}${header.text ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.5 Arial,sans-serif;margin-top:8px">${escape(header.text)}</div>` : ''}</${position}>`
}
