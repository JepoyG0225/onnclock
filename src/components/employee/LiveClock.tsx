'use client'

/**
 * Ticking wall clock for the portal home.
 *
 * The home screen is a server component, so it cannot tick — it renders once
 * per request. This is the smallest possible client island to give it a live
 * time without turning the whole page into a client component.
 *
 * Renders a placeholder until the first tick lands. Formatting the time during
 * SSR and again on mount would produce two different strings and a hydration
 * mismatch, which this page has been bitten by before.
 */
import { useEffect, useState } from 'react'

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="text-right leading-tight">
      <div className="text-[15px] font-black tabular-nums" style={{ color: '#000000' }}>
        {now
          ? now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
          : '--:--:-- --'}
      </div>
      <div className="text-[10px] text-slate-400 font-semibold">
        {/* Non-breaking space before the first tick so the header does not
            change height when the clock appears. */}
        {now
          ? now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : ' '}
      </div>
    </div>
  )
}
