'use client'
/**
 * First-login experience for brand-new company accounts.
 *  - 0 employees + never welcomed → a Welcome modal that guides them to set up
 *    their first employee (or bulk import), or take the full system tour.
 *  - >=1 employee + welcomed → a one-time "What's next" nudge on the dashboard.
 * Existing accounts (that already have employees) are silently marked welcomed,
 * so nothing changes for them. All state is per-user in localStorage.
 */
import { useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sparkles, UserPlus, Upload, Compass, ArrowRight, X } from 'lucide-react'

const welcomeKey = (u: string) => `onclock_welcome_seen_${u}`
const nextKey = (u: string) => `onclock_nextsteps_seen_${u}`

export function WelcomeOnboarding({
  userId, role, actorRole, employeeCount, enabled = false,
}: { userId: string; role: string; actorRole?: string; employeeCount: number; enabled?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const [showWelcome, setShowWelcome] = useState(false)
  const [showNext, setShowNext] = useState(false)

  const allowed = enabled && !!userId && actorRole !== 'SUPER_ADMIN' && ['COMPANY_ADMIN', 'HR_MANAGER'].includes(role)

  useEffect(() => {
    if (!allowed || typeof window === 'undefined') return
    const welcomed = window.localStorage.getItem(welcomeKey(userId))
    let kind: 'welcome' | 'next' | null = null
    if (!welcomed) {
      if (employeeCount === 0) kind = 'welcome'
      else window.localStorage.setItem(welcomeKey(userId), '1') // existing account — never nag
    }
    if (kind !== 'welcome' && employeeCount >= 1 && pathname === '/dashboard'
        && !window.localStorage.getItem(nextKey(userId))) {
      kind = 'next'
    }
    if (!kind) return
    // Defer the state update out of the effect body to avoid cascading renders.
    const id = window.setTimeout(() => {
      if (kind === 'welcome') setShowWelcome(true)
      else setShowNext(true)
    }, 300)
    return () => window.clearTimeout(id)
  }, [allowed, userId, employeeCount, pathname])

  const dismissWelcome = useCallback(() => {
    window.localStorage.setItem(welcomeKey(userId), '1')
    setShowWelcome(false)
  }, [userId])

  const startFirstEmployee = useCallback(() => {
    dismissWelcome()
    router.push('/employees/new')
  }, [dismissWelcome, router])

  const bulkImport = useCallback(() => {
    dismissWelcome()
    router.push('/employees')
  }, [dismissWelcome, router])

  const fullTour = useCallback(() => {
    dismissWelcome()
    window.dispatchEvent(new CustomEvent('onclock:start-system-tour'))
  }, [dismissWelcome])

  const dismissNext = useCallback(() => {
    window.localStorage.setItem(nextKey(userId), '1')
    setShowNext(false)
  }, [userId])

  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" onClick={dismissWelcome} />
        <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">
          <div className="px-7 pt-8 pb-6 text-center" style={{ background: 'linear-gradient(135deg,#021e47,#032b63)' }}>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Welcome to OnClock 🎉</h2>
            <p className="text-sm text-[#c4d9ff] mt-1.5 max-w-sm mx-auto">
              Let&apos;s get your HR &amp; payroll up and running. The best first step is adding your employees — everything else (timekeeping, payroll, leave) builds on that.
            </p>
          </div>
          <div className="p-6 space-y-3">
            <button onClick={startFirstEmployee}
              className="w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors hover:bg-orange-50"
              style={{ borderColor: '#ff5900' }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: '#ff5900' }}><UserPlus className="h-5 w-5" /></span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-slate-900">Set up your first employee</span>
                <span className="block text-xs text-slate-500">We&apos;ll walk you through every field, step by step.</span>
              </span>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </button>
            <button onClick={bulkImport}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Upload className="h-5 w-5" /></span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-slate-900">Bulk import employees</span>
                <span className="block text-xs text-slate-500">Already have a roster? Import many at once from a spreadsheet.</span>
              </span>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </button>
            <button onClick={fullTour}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Compass className="h-5 w-5" /></span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-slate-900">Take the full tour</span>
                <span className="block text-xs text-slate-500">A quick guided walk through every module first.</span>
              </span>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </button>
            <div className="text-center pt-1">
              <button onClick={dismissWelcome} className="text-xs font-medium text-slate-400 hover:text-slate-600">I&apos;ll explore on my own</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (showNext) {
    return (
      <div className="fixed bottom-5 right-5 z-[9990] w-[340px] rounded-2xl border border-slate-200 bg-white shadow-2xl pointer-events-auto">
        <div className="flex items-start gap-2 px-4 py-3 border-b border-slate-100">
          <Sparkles className="h-4 w-4 mt-0.5" style={{ color: '#ff5900' }} />
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">Nice — your team is in! 🎉</p>
            <p className="text-xs text-slate-500 mt-0.5">Here&apos;s what to set up next:</p>
          </div>
          <button onClick={dismissNext} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-2">
          {[
            { label: 'Work schedules', desc: 'Assign shifts so DTR & overtime compute correctly', href: '/schedules' },
            { label: 'Payroll settings', desc: 'Cut-off, contributions & tax method', href: '/payroll/settings' },
            { label: 'Leave types', desc: 'Set leave categories & entitlements', href: '/leaves/types' },
            { label: 'Run payroll', desc: 'Create your first payroll run', href: '/payroll' },
          ].map(s => (
            <button key={s.href} onClick={() => { dismissNext(); router.push(s.href) }}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50">
              <span className="flex-1">
                <span className="block text-[13px] font-semibold text-slate-800">{s.label}</span>
                <span className="block text-[11px] text-slate-500">{s.desc}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  return null
}
