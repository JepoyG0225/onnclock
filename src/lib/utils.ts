import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format number as Philippine Peso */
export function peso(amount: number | string | null | undefined): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(isNaN(num) ? 0 : num)
}

/** Format number as currency using an ISO 4217 currency code (e.g. "PHP", "USD", "SGD") */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency = 'PHP',
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  const safeNum = isNaN(num) ? 0 : num
  // Use a neutral locale so we always get a symbol prefix (e.g. $ / ₱ / S$)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'PHP',
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(safeNum)
}

/** Format number with commas */
export function formatNumber(amount: number | string | null | undefined, decimals = 2): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

/** Format date as "January 1, 2025" */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'MMMM d, yyyy')
  } catch {
    return '—'
  }
}

/** Format date as "Jan 1, 2025" */
export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

/** Format date as "2025-01-01" */
export function formatDateISO(date: Date | string | null | undefined): string {
  if (!date) return ''
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

/** Format full name "Last, First M." */
export function fullName(
  lastName: string,
  firstName: string,
  middleName?: string | null,
  suffix?: string | null
): string {
  const middle = middleName ? ` ${middleName.charAt(0)}.` : ''
  const sfx = suffix ? `, ${suffix}` : ''
  return `${lastName}, ${firstName}${middle}${sfx}`
}

/** Full name in natural order "First M. Last" */
export function naturalName(
  lastName: string,
  firstName: string,
  middleName?: string | null
): string {
  const middle = middleName ? ` ${middleName.charAt(0)}.` : ''
  return `${firstName}${middle} ${lastName}`
}

/** Get initials from name */
export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

/** Calculate number of working days between two dates (Mon-Fri) */
export function getWorkingDays(start: Date, end: Date): number {
  let count = 0
  const current = new Date(start)
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

/** Check if a date is the first cutoff (1-15) */
export function isFirstCutoff(date: Date): boolean {
  return date.getDate() <= 15
}

/** Get period label "January 1–15, 2025" */
export function getPeriodLabel(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${format(start, 'MMMM d')}–${format(end, 'd, yyyy')}`
  }
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

/** Get YYYY-MM period string from date */
export function getPeriodString(date: Date): string {
  return format(date, 'yyyy-MM')
}

export const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-[var(--brand-highlight)] text-black',
  INACTIVE: 'bg-gray-200 text-[#343434]',
  PENDING: 'bg-black text-[var(--brand-highlight)]',
  APPROVED: 'status-approved ring-1 ring-inset',
  REJECTED: 'bg-black text-white',
  CANCELLED: 'bg-gray-200 text-[#343434]',
  DRAFT: 'bg-gray-200 text-[#343434]',
  COMPUTED: 'bg-[#343434] text-white',
  FOR_APPROVAL: 'bg-[var(--brand-primary)] text-white',
  LOCKED: 'bg-[#343434] text-white',
  PROBATIONARY: 'bg-[#fff4d6] text-[#8a5a00] ring-1 ring-inset ring-[#f5d98c]',
  REGULAR: 'bg-[#e8f8f0] text-[#087a55] ring-1 ring-inset ring-[#bcebd5]',
  PART_TIME: 'bg-[#eef4ff] text-[#315ea8] ring-1 ring-inset ring-[#cfddf5]',
  CONTRACTUAL: 'bg-[#f3efff] text-[#6d4bb3] ring-1 ring-inset ring-[#ddd2f7]',
  PROJECT_BASED: 'bg-[#e8f7fa] text-[#147286] ring-1 ring-inset ring-[#c4e8ef]',
  RESIGNED: 'bg-[#f1f5f9] text-[#64748b] ring-1 ring-inset ring-[#dbe3ec]',
  TERMINATED: 'bg-[#fdecef] text-[#c52b48] ring-1 ring-inset ring-[#f7c8d1]',
  RETIRED: 'bg-[#f3f4f6] text-[#596273] ring-1 ring-inset ring-[#dfe3e8]',
}

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'
}
