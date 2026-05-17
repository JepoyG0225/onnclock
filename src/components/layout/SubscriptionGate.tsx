'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Pages that stay reachable even when the gate is active so the user
// can pay or update their billing details. `/logout` is included so they
// can sign out from anywhere; `/settings` so they can verify org info
// before paying.
const ALLOWED_PATHS = ['/settings/billing', '/billing/invoices', '/settings', '/logout']

interface Props {
  status: string
  trialEndsAt: string | null
  children: React.ReactNode
  bypassGate?: boolean
  /**
   * Active employees − paid seats (clamped at 0).  When > 0 on an ACTIVE
   * subscription the company is operating past their paid seat count, so
   * the gate routes them to billing the same way it does for EXPIRED.
   * TRIAL companies pass 0 (no enforcement) — the value here is only the
   * already-over portion, so we don't need to filter by status again.
   */
  unbilledSeats?: number
}

export function SubscriptionGate({ status, children, bypassGate, unbilledSeats = 0 }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const isExpired = !bypassGate && (status === 'EXPIRED' || status === 'CANCELLED')
  const isOverSeats = !bypassGate && unbilledSeats > 0
  const needsGate = isExpired || isOverSeats
  const isAllowed = ALLOWED_PATHS.some(p => pathname.startsWith(p))

  useEffect(() => {
    if (needsGate && !isAllowed) {
      router.replace('/settings/billing')
    }
  }, [needsGate, isAllowed, router])

  if (needsGate && !isAllowed) return null

  return <>{children}</>
}
