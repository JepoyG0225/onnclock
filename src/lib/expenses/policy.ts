import { z } from 'zod'

export const expenseCategories = ['Transportation', 'Meals', 'Accommodation', 'Supplies', 'Communication', 'Medical', 'Other'] as const
export const expenseStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'] as const
export const money = (n: number) => Number(n.toFixed(2))
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v
}, 'Enter a valid calendar date.')
const amount = z.coerce.number().finite().positive().max(9999999999.99).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < .0001, 'Use at most two decimal places.')
export const expenseItemSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1, 'Enter an item name.').max(160),
  description: z.string().trim().min(1, 'Enter an item description.').max(1500), amount,
})
export const expenseItemsSchema = z.array(expenseItemSchema).min(1, 'Add at least one expense item.').max(50)
  .refine(items => new Set(items.map(item => item.id)).size === items.length, 'Item IDs must be unique.')
export const claimFields = z.object({
  category: z.string().trim().min(1).max(80), description: z.string().trim().min(3).max(3000),
  expenseDate: dateOnly, amount: amount.optional(), items: expenseItemsSchema.optional(), isLiquidation: z.boolean().default(false),
  cashAdvanceAmount: amount.optional(),
}).refine(d => !!d.items?.length || d.amount != null, { message: 'Add expense items.', path: ['items'] })
.transform(d => ({ ...d, amount: d.items ? d.items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100 : d.amount! }))
.refine(d => d.amount <= 9999999999.99, { message: 'Claim total is too large.', path: ['items'] })
.refine(d => !d.isLiquidation || d.cashAdvanceAmount != null, { message: 'Enter the cash advance received.', path: ['cashAdvanceAmount'] })
export const createClaimSchema = z.object({ requestKey: z.string().uuid(), fields: claimFields })
const version = { updatedAt: z.string().datetime() }
export const claimActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('EDIT'), ...version, fields: claimFields }),
  z.object({ action: z.literal('SUBMIT'), ...version }),
  z.object({ action: z.literal('CANCEL'), ...version }),
  z.object({ action: z.literal('APPROVE'), ...version, approvedAmount: amount, note: z.string().trim().max(1000).default('') }),
  z.object({ action: z.literal('REJECT'), ...version, note: z.string().trim().min(3).max(1000) }),
  z.object({ action: z.literal('PAY'), ...version, paymentMethod: z.enum(['BANK', 'CASH']), paymentReference: z.string().trim().min(3).max(150), paymentDate: dateOnly }),
])
export function settlementAmount(approved: number, isLiquidation: boolean, advance: number | null) {
  return money(approved - (isLiquidation ? advance ?? 0 : 0))
}
export function expenseActionError(action: string, claim: { status: string; amount: number; hasReceipt: boolean }, owner: boolean, approver: boolean, approvedAmount?: number) {
  if (['EDIT', 'SUBMIT', 'CANCEL'].includes(action) && !owner) return 'Only the claimant can change or submit this claim.'
  if (['APPROVE', 'REJECT', 'PAY'].includes(action) && (!approver || owner)) return owner ? 'Another reviewer must review and settle your claim.' : 'Expense approval permission is required.'
  const states: Record<string, string[]> = { EDIT: ['DRAFT', 'REJECTED'], SUBMIT: ['DRAFT'], CANCEL: ['DRAFT', 'PENDING', 'REJECTED'], APPROVE: ['PENDING'], REJECT: ['PENDING'], PAY: ['APPROVED'] }
  if (!states[action]?.includes(claim.status)) return 'This action is not available for the current claim status.'
  if (action === 'SUBMIT' && !claim.hasReceipt) return 'Attach a receipt before submitting.'
  if (action === 'APPROVE' && (approvedAmount == null || approvedAmount <= 0 || approvedAmount > claim.amount)) return 'Approved amount must be positive and cannot exceed the claimed amount.'
  return null
}
export function csvCell(value: unknown) {
  const text = String(value ?? '')
  return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" : '') + text.replace(/"/g, '""') + '"'
}

export const canManageExpenseTypes = (role: string) => ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(role)
export function companyExpenseTypes(value: unknown): string[] {
  return Array.isArray(value) && value.length && value.every(v => typeof v === 'string') ? value as string[] : [...expenseCategories]
}
export const expenseTypesSchema = z.object({
  previous: z.array(z.string()),
  types: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
}).refine(v => new Set(v.types.map(t => t.toLowerCase())).size === v.types.length, 'Expense type names must be unique.')
