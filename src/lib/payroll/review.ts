import { readDeductionCarryover } from './deduction-carryover'

export const ADJUSTABLE_FIELDS = [
  'basicSalary', 'regularOtAmount', 'restDayOtAmount', 'holidayOtAmount',
  'nightDiffAmount', 'holidayPayAmount', 'sssEmployee', 'philhealthEmployee',
  'pagibigEmployee', 'withholdingTax', 'lateDeduction', 'undertimeDeduction', 'absenceDeduction',
] as const
export type AdjustableField = typeof ADJUSTABLE_FIELDS[number]
export function readCalculatedValues(basis: unknown): Partial<Record<AdjustableField, number>> {
  if (!basis || typeof basis !== 'object') return {}
  const values = (basis as { calculatedValues?: Record<string, unknown> }).calculatedValues ?? {}
  return Object.fromEntries(ADJUSTABLE_FIELDS.filter(key => typeof values[key] === 'number' && Number.isFinite(values[key])).map(key => [key, values[key]]))
}
export function readCalculatedAt(basis: unknown): string | null {
  if (!basis || typeof basis !== 'object') return null
  const value = (basis as { calculatedAt?: unknown }).calculatedAt
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
}

export function readPreviousPay(basis: unknown): { grossPay: number; totalDeductions: number; netPay: number } | null {
  if (!basis || typeof basis !== 'object') return null
  const value = (basis as { previousPay?: { grossPay: number; totalDeductions: number; netPay: number } }).previousPay
  return value && [value.grossPay, value.totalDeductions, value.netPay].every(n => typeof n === 'number' && Number.isFinite(n)) ? value : null
}

export function matchesPayrollReview(row: {
  employee: { firstName: string; lastName: string; employeeNo: string; department: { name: string } | null }
  netPay: number; grossPay: number; totalDeductions: number; calculationBasis?: unknown
  hasManualEdits?: boolean; basicPayManuallyEdited?: boolean
  customIncomes: unknown[]; customDeductions: unknown[]
}, search: string, filter: string, hasIssues: boolean): boolean {
  const text = `${row.employee.firstName} ${row.employee.lastName} ${row.employee.lastName} ${row.employee.firstName} ${row.employee.employeeNo} ${row.employee.department?.name ?? ''}`.toLowerCase()
  if (!text.includes(search.trim().toLowerCase())) return false
  if (filter === 'issues') return hasIssues
  if (filter === 'zero') return row.netPay <= 0
  if (filter === 'carryover') return (readDeductionCarryover(row.calculationBasis)?.deferredTotal ?? 0) > 0
  if (filter === 'adjusted') return !!row.hasManualEdits || !!row.basicPayManuallyEdited || row.customIncomes.length > 0 || row.customDeductions.length > 0
  if (filter === 'changed') {
    const prior = readPreviousPay(row.calculationBasis)
    return !!prior && (prior.netPay !== row.netPay || prior.grossPay !== row.grossPay || prior.totalDeductions !== row.totalDeductions)
  }
  return true
}
