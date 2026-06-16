'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils'

// Module-level cache so all components share one fetch per page load
let _cached: string | null = null
let _promise: Promise<string> | null = null

async function fetchCurrency(): Promise<string> {
  if (_cached) return _cached
  if (!_promise) {
    _promise = fetch('/api/payroll/settings')
      .then(r => r.json())
      .then(d => {
        const c = (d?.locale?.payrollCurrency ?? d?.settings?.payrollCurrency ?? 'PHP') as string
        _cached = c.toUpperCase()
        return _cached
      })
      .catch(() => 'PHP')
  }
  return _promise
}

/**
 * Returns the company's configured payroll currency and a formatter function.
 *
 * Usage:
 *   const { fmt, currency } = useCurrency()
 *   fmt(15000)  // "₱15,000.00"  or  "$15,000.00"  depending on settings
 */
export function useCurrency() {
  const [currency, setCurrency] = useState<string>(_cached ?? 'PHP')

  useEffect(() => {
    let active = true
    fetchCurrency().then(c => { if (active) setCurrency(c) })
    return () => { active = false }
  }, [])

  function fmt(amount: number | string | null | undefined): string {
    return formatCurrency(amount, currency)
  }

  /** Currency symbol only (e.g. "₱", "$", "S$") */
  function symbol(): string {
    try {
      const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(0)
      return parts.find(p => p.type === 'currency')?.value ?? currency
    } catch {
      return currency
    }
  }

  return { currency, fmt, symbol }
}
