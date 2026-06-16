'use client'

import { useEffect, useState } from 'react'

/**
 * Thin wrapper around the Individual Payslips card on the payroll-run
 * detail page. Listens for a `payroll-recomputing` window event so it
 * can dim the card and overlay a "Recomputing…" spinner while the
 * compute endpoint runs, then refreshes once it's done.
 *
 * This is intentionally lightweight — the actual data is server-rendered
 * by the page itself; this wrapper just gives the UI a visible busy
 * state during recompute without re-architecting the page into a client
 * component.
 */
export function PayrollPayslipsLoader({ children }: { children: React.ReactNode }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function start() { setBusy(true) }
    function end() { setBusy(false) }
    window.addEventListener('payroll-recomputing', start)
    window.addEventListener('payroll-recomputed', end)
    return () => {
      window.removeEventListener('payroll-recomputing', start)
      window.removeEventListener('payroll-recomputed', end)
    }
  }, [])

  return (
    <div className="relative">
      <div className={busy ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}>
        {children}
      </div>
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-lg shadow-md px-4 py-2 flex items-center gap-2 border border-slate-200">
            <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-slate-700">Recomputing payslips…</span>
          </div>
        </div>
      )}
    </div>
  )
}
