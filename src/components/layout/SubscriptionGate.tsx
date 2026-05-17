'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, ArrowRight } from 'lucide-react'

// EXPIRED/CANCELLED still does a hard router.replace to billing — those
// companies can't use the app at all. The list below stays the set of
// pages allowed when fully gated.
const ALLOWED_PATHS = ['/settings/billing', '/billing/invoices', '/settings', '/logout']

interface Props {
  status: string
  trialEndsAt: string | null
  children: React.ReactNode
  bypassGate?: boolean
  /**
   * Active employees − paid seats (clamped at 0). When > 0 on an ACTIVE
   * subscription the company is operating past their paid seat count, so
   * the gate pops a modal asking them to settle the unpaid seats. TRIAL
   * companies pass 0 (no enforcement). The modal appears on EVERY
   * dashboard page so the prompt stays visible, with a "Dismiss for now"
   * link that hides it for the rest of the session so the user can still
   * pay on /settings/billing or sign out.
   */
  unbilledSeats?: number
}

export function SubscriptionGate({ status, children, bypassGate, unbilledSeats = 0 }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const isExpired = !bypassGate && (status === 'EXPIRED' || status === 'CANCELLED')
  const isOverSeats = !bypassGate && unbilledSeats > 0
  const isAllowed = ALLOWED_PATHS.some(p => pathname.startsWith(p))

  // EXPIRED/CANCELLED still hard-redirects.
  useEffect(() => {
    if (isExpired && !isAllowed) {
      router.replace('/settings/billing')
    }
  }, [isExpired, isAllowed, router])

  if (isExpired && !isAllowed) return null

  return (
    <>
      {children}
      {isOverSeats && <UnpaidSeatsModal count={unbilledSeats} />}
    </>
  )
}

/**
 * Blocking modal shown on every dashboard page when the company has
 * more active employees than they're paying for. Two interactions:
 *   - "Go to Billing"     → routes to /settings/billing
 *   - "Dismiss for now"   → hides for the rest of the browser session
 *                            (sessionStorage). Reappears on refresh so
 *                            the prompt never gets permanently muted.
 *
 * Dismissal is keyed on the unbilled-seat count, so if HR adds another
 * employee and the count changes, the modal re-pops.
 *
 * Rendered via createPortal so it escapes whatever container it's nested
 * in and sits above the rest of the UI.
 */
function UnpaidSeatsModal({ count }: { count: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)

  const storageKey = `unpaid-seats-dismissed:${count}`

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      setDismissed(window.sessionStorage.getItem(storageKey) === '1')
    }
  }, [storageKey])

  // Reset dismissal whenever the count changes (handled implicitly because
  // the storageKey includes count — but also re-check on route change so
  // the user gets a fresh evaluation when they navigate).
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(window.sessionStorage.getItem(storageKey) === '1')
    }
  }, [pathname, storageKey])

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(storageKey, '1')
    }
    setDismissed(true)
  }

  if (!mounted || dismissed) return null
  const target = typeof document !== 'undefined' ? document.body : null
  if (!target) return null

  const onBilling = pathname.startsWith('/settings/billing')

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unpaid-seats-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex flex-col items-center text-center px-6 pt-7 pb-5">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-amber-700" />
          </div>
          <h2 id="unpaid-seats-title" className="text-lg font-black text-slate-900">
            You have {count} unpaid {count === 1 ? 'seat' : 'seats'}
          </h2>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Please settle {count === 1 ? 'it' : 'them'} first before continuing.
            Your active employee count has exceeded your paid subscription.
          </p>
        </div>
        <div className="px-6 pb-5 space-y-2">
          {onBilling ? (
            <button
              type="button"
              onClick={dismiss}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg,#2E4156,#1A2D42)' }}
            >
              Settle Now
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push('/settings/billing')}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg,#2E4156,#1A2D42)' }}
            >
              Go to Billing
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="w-full text-xs text-slate-500 hover:text-slate-700 py-1"
          >
            Dismiss for now
          </button>
        </div>
      </div>
    </div>,
    target,
  )
}
