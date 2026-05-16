'use client'

/**
 * Tiny self-contained component that owns the per-second trial countdown
 * ticker.  Previously this state (trialMsLeft / trialTimeLeft) lived on
 * the AppSidebar itself, which meant the *entire* 800-line sidebar (every
 * nav item, every icon, every Tooltip) re-rendered every second — killing
 * perceived responsiveness during page navigation.
 *
 * By owning the timer here, only this small subtree re-renders.  The
 * parent passes the immutable `trialEndsAtMs` once and never re-renders
 * because of countdown changes.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Timer, Zap } from 'lucide-react'

// Hover tooltip that mirrors the sidebar's local Tooltip component but
// stays inlined here so we don't introduce a new shared dependency.
function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group">
      {children}
      <div
        className="pointer-events-none absolute z-50 whitespace-nowrap rounded-lg px-2.5 py-1.5
                   bg-gray-900 text-white text-xs font-medium shadow-xl
                   opacity-0 group-hover:opacity-100 transition-opacity duration-150
                   left-full ml-3 top-1/2 -translate-y-1/2"
      >
        {label}
        <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
      </div>
    </div>
  )
}

type Props = {
  trialEndsAtMs: number
  collapsed: boolean
}

function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return 'Expired'
  const totalSec = Math.floor(diffMs / 1000)
  const days  = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins  = Math.floor((totalSec % 3600) / 60)
  const secs  = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(mins)}m`
  if (hours > 0) return `${hours}h ${pad(mins)}m ${pad(secs)}s`
  return `${pad(mins)}m ${pad(secs)}s`
}

export function TrialCountdownBanner({ trialEndsAtMs, collapsed }: Props) {
  const [msLeft, setMsLeft] = useState(() => Math.max(0, trialEndsAtMs - Date.now()))

  useEffect(() => {
    function tick() {
      setMsLeft(Math.max(0, trialEndsAtMs - Date.now()))
    }
    tick()
    // 1s tick when expanded (full HMS countdown visible); 30s tick when
    // collapsed (only the days-left badge is shown, sub-minute precision
    // is wasted work).
    const intervalMs = collapsed ? 30_000 : 1_000
    const id = window.setInterval(tick, intervalMs)
    return () => window.clearInterval(id)
  }, [trialEndsAtMs, collapsed])

  const timeLeft = formatCountdown(msLeft)
  const daysLeft = Math.max(0, Math.floor(msLeft / 86_400_000))
  const isUrgent = msLeft < 2 * 86_400_000
  const progressPct = Math.min(100, Math.max(2, (msLeft / (7 * 86_400_000)) * 100))

  if (collapsed) {
    return (
      <Tooltip label={`Free trial: ${timeLeft} left`}>
        <Link
          href="/settings/billing"
          className="flex items-center justify-center w-10 h-10 mx-auto rounded-xl relative mt-1 mb-1"
          style={{ background: 'rgba(250,94,1,0.25)' }}
        >
          <Timer className="w-4 h-4 text-orange-300" />
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-[9px] font-black text-white leading-none">
            {daysLeft}
          </span>
        </Link>
      </Tooltip>
    )
  }

  return (
    <div className="mx-3 mt-1 mb-2 rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.18)' }}>
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-orange-300" />
            <span className="text-[11px] font-bold text-white/80 uppercase tracking-wide">Free Trial</span>
          </div>
          <span
            className="text-[10px] font-black px-2 py-0.5 rounded-full"
            style={{
              background: isUrgent ? 'rgba(239,68,68,0.3)' : 'rgba(250,94,1,0.3)',
              color: isUrgent ? '#fca5a5' : '#fdba74',
            }}
          >
            {timeLeft || '—'}
          </span>
        </div>
        {/* Progress bar — 7 day trial */}
        <div className="h-1 rounded-full mb-2.5" style={{ background: 'rgba(255,255,255,0.15)' }}>
          <div
            className="h-1 rounded-full transition-all"
            style={{
              width: `${progressPct}%`,
              background: isUrgent
                ? 'linear-gradient(90deg, #ef4444, #f97316)'
                : 'linear-gradient(90deg, #f97316, #fbbf24)',
            }}
          />
        </div>
        <Link
          href="/settings/billing"
          className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #fa5e01, #e04e00)' }}
        >
          <Zap className="w-3 h-3" />
          Upgrade Now
        </Link>
      </div>
    </div>
  )
}
