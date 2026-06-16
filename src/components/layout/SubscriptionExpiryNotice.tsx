'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, X, Clock } from 'lucide-react'

interface Props {
  expiresAt: string | null   // ISO date string — either trialEndsAt or currentPeriodEnd
  isTrial: boolean
}

const POPUP_SESSION_KEY = 'onclock_expiry_popup_dismissed'
const BANNER_SESSION_KEY = 'onclock_expiry_banner_dismissed'
const BILLING_PATH = '/settings/billing'
const POPUP_THRESHOLD_DAYS = 3
const BANNER_THRESHOLD_DAYS = 7

function computeDaysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000))
}

export function SubscriptionExpiryNotice({ expiresAt, isTrial }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [popupOpen, setPopupOpen] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(false)

  const daysLeft = expiresAt ? computeDaysLeft(expiresAt) : null
  const planLabel = isTrial ? 'free trial' : 'subscription'

  useEffect(() => {
    if (daysLeft === null) return
    if (pathname.startsWith(BILLING_PATH)) return

    // Banner: show for ≤7 days, dismissible per session
    if (daysLeft <= BANNER_THRESHOLD_DAYS) {
      const dismissed = sessionStorage.getItem(BANNER_SESSION_KEY)
      if (!dismissed) setBannerVisible(true)
    }

    // Popup: show for ≤3 days, once per session
    if (daysLeft <= POPUP_THRESHOLD_DAYS) {
      const dismissed = sessionStorage.getItem(POPUP_SESSION_KEY)
      if (!dismissed) {
        const id = setTimeout(() => setPopupOpen(true), 800)
        return () => clearTimeout(id)
      }
    }
  }, [daysLeft, pathname])

  function dismissBanner() {
    sessionStorage.setItem(BANNER_SESSION_KEY, '1')
    setBannerVisible(false)
  }

  function dismissPopup() {
    sessionStorage.setItem(POPUP_SESSION_KEY, '1')
    setPopupOpen(false)
  }

  function goToBilling() {
    dismissPopup()
    router.push(BILLING_PATH)
  }

  if (daysLeft === null || pathname.startsWith(BILLING_PATH)) return null

  const urgencyColor =
    daysLeft <= 1
      ? { bg: 'bg-red-600', text: 'text-white', border: 'border-red-700', badge: 'bg-red-700', hex: '#dc2626' }
      : daysLeft <= 3
      ? { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600', badge: 'bg-orange-600', hex: '#ea580c' }
      : { bg: 'bg-amber-400', text: 'text-amber-950', border: 'border-amber-500', badge: 'bg-amber-500', hex: '#d97706' }

  return (
    <>
      {/* ── Top Banner ─────────────────────────────────────────────────── */}
      {bannerVisible && (
        <div
          className={`fixed top-0 left-0 right-0 z-[9990] flex items-center justify-center gap-3 px-4 py-2 text-sm font-semibold ${urgencyColor.bg} ${urgencyColor.text}`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Your {planLabel}{' '}
            {daysLeft === 0
              ? 'expires today'
              : `expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
            {' '}—{' '}
            <button
              type="button"
              onClick={goToBilling}
              className="underline underline-offset-2 font-bold hover:opacity-80"
            >
              Renew now
            </button>
          </span>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Dismiss"
            className="ml-2 rounded-md p-0.5 opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Modal Popup (≤3 days) ────────────────────────────────────────── */}
      {popupOpen && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={dismissPopup}
          />

          {/* Card */}
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Coloured header band */}
            <div
              className="px-6 py-5 flex items-center gap-3"
              style={{ background: urgencyColor.hex }}
            >
              <div className="rounded-xl bg-white/20 p-2">
                <Clock className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white/80 uppercase tracking-wide">
                  {isTrial ? 'Free Trial' : 'Subscription'} Expiring
                </p>
                <h2 className="text-xl font-extrabold text-white leading-tight">
                  {daysLeft === 0
                    ? 'Expires today!'
                    : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`}
                </h2>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 leading-relaxed mb-1">
                Your Onclock <strong>{planLabel}</strong> is about to expire.
                After it ends, dashboard access will be restricted until renewed.
              </p>
              {expiresAt && (
                <p className="text-xs text-slate-400 mt-2">
                  Expiry date:{' '}
                  <strong className="text-slate-600">
                    {new Date(expiresAt).toLocaleDateString('en-PH', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </strong>
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 pb-5 flex items-center gap-3">
              <button
                type="button"
                onClick={goToBilling}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: urgencyColor.hex }}
              >
                Renew Subscription →
              </button>
              <button
                type="button"
                onClick={dismissPopup}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
