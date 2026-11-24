import type { z } from 'zod'
import type { expenseItemSchema } from './policy'
export type ExpenseItem = z.infer<typeof expenseItemSchema> & { receiptPath?: string; receiptFileName?: string }
export function storedItems(value: unknown): ExpenseItem[] {
  return Array.isArray(value) ? value as ExpenseItem[] : []
}
/** Clients never supply receipt paths; keep only attachments already saved to this claim. */
export function mergeExpenseItems(items: z.infer<typeof expenseItemSchema>[], previous: unknown): ExpenseItem[] {
  const existing = new Map(storedItems(previous).map(item => [item.id, item]))
  return items.map(({ id, name, description, amount }) => {
    const old = existing.get(id)
    return { id, name, description, amount, ...(old?.receiptPath ? { receiptPath: old.receiptPath, receiptFileName: old.receiptFileName } : {}) }
  })
}
export function hasExpenseReceipts(claim: { items?: unknown; receiptPath?: string | null; receiptUrl?: string | null }) {
  const items = storedItems(claim.items)
  return items.length ? items.every(item => !!item.receiptPath) : !!(claim.receiptPath || claim.receiptUrl)
}
export function publicExpense<T extends { items?: unknown; receiptPath?: string | null; receiptUrl?: string | null }>(claim: T) {
  const rest = { ...claim }
  delete rest.receiptPath
  delete rest.receiptUrl
  return { ...rest, items: storedItems(claim.items).map(({ receiptPath, ...item }) => ({ ...item, hasReceipt: !!receiptPath })), hasReceipt: hasExpenseReceipts(claim) }
}
