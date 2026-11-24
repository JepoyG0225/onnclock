import { z } from 'zod'
import { certificateFontIds } from './certificate-fonts'

export const certificateVariables = {
  employee_name: 'Employee name', employee_number: 'Employee number', company_name: 'Company name',
  course_title: 'Course / certification title', issued_date: 'Date issued (automatic)', expiry_date: 'Expiry date', credential_id: 'Credential ID',
} as const
export const templateFieldSchema = z.object({
  id: z.string().min(1).max(100), text: z.string().min(1).max(500),
  x: z.number().min(0).max(100), y: z.number().min(0).max(100), width: z.number().min(1).max(100),
  fontSize: z.number().min(8).max(96), bold: z.boolean(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  align: z.enum(['left', 'center', 'right']),
  fontFamily: z.enum(certificateFontIds).default('montserrat'),
}).refine(f => f.x + f.width <= 100.01, { message: 'Field must fit within the certificate width.' })
export const templateFieldsSchema = z.array(templateFieldSchema).max(30).refine(fields => new Set(fields.map(f => f.id)).size === fields.length, { message: 'Field IDs must be unique.' }).refine(fields => fields.every(f => [...f.text.matchAll(/\{\{([^}]+)\}\}/g)].every(m => Object.hasOwn(certificateVariables, m[1].trim()))), { message: 'Use one of the supported certificate variables.' })
export const templateSnapshotSchema = z.object({
  backgroundPath: z.string().min(1), backgroundMime: z.enum(['image/png', 'image/jpeg']),
  width: z.number().positive().max(2000), height: z.number().positive().max(4000), fields: templateFieldsSchema,
})
export type CertificateField = z.infer<typeof templateFieldSchema>
export type CertificateSnapshot = z.infer<typeof templateSnapshotSchema>
export function snapshotTemplate(template: unknown) {
  return templateSnapshotSchema.parse(template)
}
export function fillCertificateText(text: string, values: Record<string, string>) {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => Object.hasOwn(values, key.trim()) ? values[key.trim()] : '').replace(/[\r\n\t]/g, ' ')
}
