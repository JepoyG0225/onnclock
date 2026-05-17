'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, ArrowRight } from 'lucide-react'

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
   * Active employees − paid seats (clamped at 0). When > 0 on an ACTIVE
   * subscription the company is operating past their paid seat count, so
   * the gate pops a modal asking them to settle the unpaid seats. TRIAL
   * companies pass 0 (no enforcement) — the value here is only the
   * already-over portion, so we don't need to filter by status again.
   */
  unbilledSeats?: number
}

export function SubscriptionGate({ status, children, bypassGate, unbilledSeats = 0 }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const isExpired = !bypassGate && (status === 'EXPIRED' || status === 'CANCELLED')
  const isOverSeats = !bypassGate && unbilledSeats > 0
  const isAllowed = ALLOWED_PATHS.some(p => pathname.startsWith(p))

  // EXPIRED/CANCELLED still hard-redirects (UX unchanged — those companies
  // can't use the app at all, so dropping them on billing is the right move).
  useEffect(() => {
    if (isExpired && !isAllowed) {
      router.replace('/settings/billing')
    }
  }, [isExpired, isAllowed, router])

  if (isExpired && !isAllowed) return null

  const showOverSeatModal = isOverSeats && !isAllowed

  return (
    <>
      {children}
      {showOverSeatModal && <UnpaidSeatsModal count={unbilledSeats} />}
    </>
  )
}

/**
 * Blocking modal shown on every dashboard page (outside settings/billing)
 * when the company has more active employees than they're paying for.
 * Single CTA: route to /settings/billing to settle the unpaid seats.
 *
 * Rendered via createPortal so it escapes whatever container it's nested
 * in and sits above the rest of the UI. No dismiss button — by design;
 * the company has to acknowledge billing to continue using the dashboard.
 */
function UnpaidSeatsModal({ count }: { count: number }) {
  const router = useRouter()
  const target = typeof document !== 'undefined' ? document.body : null
  if (!target) return null

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
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={() => router.push('/settings/billing')}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg,#2E4156,#1A2D42)' }}
          >
            Go to Billing
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>,
    target,
  )
}
