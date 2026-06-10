'use client'

/**
 * App-root error boundary. Unlike segment-level error.tsx files, this
 * fires when the ROOT layout or any layout above the affected segment
 * throws — Next.js's segment error.tsx doesn't catch its own layout's
 * exceptions, so without this a server-side throw in `(dashboard)/
 * layout.tsx` or `(employee)/layout.tsx` would render the unbranded
 * "application error" page.
 *
 * Must define its own <html> and <body> because at this point Next.js
 * has already aborted the root layout render.
 */

import { useEffect } from 'react'
import { signOut } from 'next-auth/react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[global-error-boundary]', { message: error.message, digest: error.digest })
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f0f6f8', minHeight: '100vh' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 440, borderRadius: 16, background: '#fff', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.10), 0 8px 10px -6px rgba(0,0,0,0.10)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '32px 24px 24px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee2e2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 26, color: '#dc2626' }} aria-hidden>!</span>
              </div>
              <h1 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0 }}>Something went wrong</h1>
              <p style={{ fontSize: 14, color: '#475569', marginTop: 12, lineHeight: 1.5 }}>
                We couldn&apos;t load this page. This is usually a temporary
                issue — try refreshing in a moment.
              </p>
              {error.digest && (
                <p style={{ marginTop: 12, fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: '#94a3b8', wordBreak: 'break-all' }}>
                  Reference: {error.digest}
                </p>
              )}
            </div>
            <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => reset()}
                style={{ padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#fff', background: '#021e47', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                Try again
              </button>
              <button
                onClick={() => {
                  document.cookie = 'portal_session=; path=/; Max-Age=0; SameSite=Lax'
                  void signOut({ redirect: false }).catch(() => null)
                  window.location.assign('/login')
                }}
                style={{ padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#334155', background: 'transparent', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
