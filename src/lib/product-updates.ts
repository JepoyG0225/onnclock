import type { Permission } from '@/lib/auth/permissions'

// A new ID gives every eligible user one receipt for this release.
export const CURRENT_UPDATE_ID = '2026-11-20-payslip-customization'
export const UPDATE_STARTS_AT = '2026-11-20T00:00:00+08:00'
export const UPDATE_EXPIRES_AT = '2026-11-23T00:00:00+08:00'
export type ProductUpdate = { title: string; description: string; label: 'New' | 'Improved'; plan?: string }
export type ProductRelease = { id: string; title: string; date: string; expiresAt: string; updates: ProductUpdate[]; spotlight?: ProductUpdate }
export function productRelease(role: string, permissions: Permission[], now = new Date()): ProductRelease | null {
  if (now.getTime() < Date.parse(UPDATE_STARTS_AT) || now.getTime() >= Date.parse(UPDATE_EXPIRES_AT)) return null
  if (role === 'EMPLOYEE' || !permissions.some(p => p === 'payroll:read' || p === 'payroll:write')) return null
  return { id: CURRENT_UPDATE_ID, title: "Customize your company's payslips", date: 'November 20, 2026', expiresAt: UPDATE_EXPIRES_AT, updates: [
    { title: 'Your Company, Your Payslip Theme', label: 'New', description: 'Open Payroll Settings > Payslip Design to choose your colors, add logos and company details, and format or drag header and footer elements. Preview the PDF before saving your design.' },
    { title: 'Choose Whether to Show Deductions', label: 'New', description: 'Turn on Hide deductions on payslip to remove deduction details, total deductions, and year-to-date withholding tax from downloaded payslips. Gross and net pay stay visible, and payroll calculations remain unchanged. Editing requires payroll write access.' },
  ] }
}
