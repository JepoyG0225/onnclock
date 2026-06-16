'use client'

/**
 * Portal-level error boundary. Catches any uncaught exception thrown by
 * server components in the (employee) tree (portal layout, page server
 * actions, data loaders) and renders a graceful retry UI instead of
 * Next.js's generic "application error" page. The error itself is
 * captured to Vercel runtime logs via console.error so we can investigate
 * per company / digest.
 *
 * The reset() function tells the Next.js router to retry rendering the
 * failed segment — useful for transient DB/network blips that resolve
 * on a second attempt.
 */

import { useEffect } from 'react'
import { signOut } from 'next-auth/react'
import { RefreshCw, AlertCircle, LogOut } from 'lucide-react'

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[portal-error-boundary]', { message: error.message, digest: error.digest })
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f0f6f8' }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden border border-slate-200">
        <div className="px-6 pt-8 pb-6 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-600" />
          </div>
          <h1 className="text-lg font-black text-slate-900">Something went wrong</h1>
          <p className="text-sm text-slate-600 mt-3 leading-relaxed">
            We couldn&apos;t load this page. This is usually a temporary issue —
            try refreshing in a moment.
          </p>
          {error.digest && (
            <p className="mt-3 text-[10px] font-mono text-slate-400 break-all">
              Reference: {error.digest}
            </p>
          )}
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col gap-2">
          <button
            onClick={() => reset()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ background: '#021e47' }}
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <button
            onClick={() => {
              document.cookie = 'portal_session=; path=/; Max-Age=0; SameSite=Lax'
              void signOut({ redirect: false }).catch(() => null)
              window.location.assign('/portal/login')
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-white border border-slate-200 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
