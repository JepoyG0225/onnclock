'use client'

import Link from 'next/link'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { PayrollAnomaly } from '@/lib/payroll/anomalies'

export function PayrollAnomalyPanel({ anomalies }: { anomalies: PayrollAnomaly[] }) {
  const critical = anomalies.filter(item => item.severity === 'critical').length
  const warning = anomalies.filter(item => item.severity === 'warning').length
  const needsReview = critical + warning > 0
  const label = needsReview ? `Payroll needs attention: ${critical} critical, ${warning} warnings, ${anomalies.length} total checks. Click to expand.` : anomalies.length ? 'Payroll information available. No warnings or critical issues. Click for details.' : 'Payroll checks passed. Click for details.'
  return (
    <details className="group shrink-0" onKeyDown={event => {
      if (event.key === 'Escape') {
        event.currentTarget.open = false
        event.currentTarget.querySelector('summary')?.focus()
      }
    }}>
      <summary aria-label={label} title={label} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
        {needsReview ? <AlertTriangle aria-hidden="true" className="h-5 w-5 text-red-600 payroll-review-blink" /> : anomalies.length ? <Info aria-hidden="true" className="h-5 w-5 text-blue-600" /> : <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-emerald-600" />}
      </summary>
      <section aria-label="Payroll checks" className="absolute right-0 top-full z-40 mt-1 w-[min(40rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <header className="flex flex-wrap items-center justify-between gap-1 border-b px-3 py-2">
          <h2 className="text-sm font-semibold">{needsReview ? 'Needs attention' : 'Payroll checks'}</h2>
          <span className="text-xs text-slate-500">{critical} critical | {warning} warnings</span>
        </header>
        {anomalies.length === 0 ? <p className="px-3 py-2 text-xs text-emerald-700">No payroll anomalies detected.</p> : <div className="max-h-72 space-y-1 overflow-y-auto overscroll-contain p-2">
          {anomalies.map(item => {
            const Icon = item.severity === 'critical' ? AlertCircle : item.severity === 'warning' ? AlertTriangle : Info
            const tone = item.severity === 'critical' ? 'border-red-200 bg-red-50 text-red-800' : item.severity === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'
            return <div key={item.key} className={`flex gap-2 rounded-lg border px-2.5 py-2 ${tone}`}>
              <Icon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0"><p className="text-xs font-semibold">{item.employeeName ? `${item.employeeName}: ` : ''}{item.title}</p><p className="mt-0.5 text-xs leading-snug">{item.detail}</p>
                {item.reviewHref ? <Link href={item.reviewHref} className="mt-1 inline-flex min-h-8 items-center text-xs font-semibold underline underline-offset-2">View employee profile</Link> : item.employeeId && <button type="button" className="mt-1 min-h-8 text-xs font-semibold underline underline-offset-2" onClick={event => {
                  const panel = event.currentTarget.closest('details')
                  if (panel) panel.open = false
                  window.dispatchEvent(new CustomEvent('payroll-review-employee', { detail: { employeeId: item.employeeId } }))
                }}>Review employee</button>}
              </div>
            </div>
          })}
        </div>}
      </section>
    </details>
  )
}
