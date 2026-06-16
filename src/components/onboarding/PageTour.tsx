'use client'
/**
 * First-visit, per-page guided tour. Mounted once in the dashboard layout; it
 * watches the pathname, and the first time a user opens a page that has a tour
 * (see lib/onboarding/page-tours) it walks them through it with a spotlight +
 * explainer cards. Fully dismissible: "Skip" marks just this page seen,
 * "Don't show tours" turns them all off. All state is per-user in localStorage,
 * so it never affects existing users who've already explored.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { resolvePageTour, type PageTour as TourDef } from '@/lib/onboarding/page-tours'

const seenKey = (uid: string, key: string) => `onclock_pagetour_${uid}_${key}`
const offKey = (uid: string) => `onclock_tours_off_${uid}`

export function PageTour({ userId, role, actorRole, enabled = false }: { userId: string; role: string; actorRole?: string; enabled?: boolean }) {
  const pathname = usePathname()
  const [tour, setTour] = useState<TourDef | null>(null)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardPos, setCardPos] = useState<{ top: number; left: number }>({ top: 96, left: 0 })

  const allowed = enabled && !!userId && actorRole !== 'SUPER_ADMIN' && ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'DEPARTMENT_HEAD'].includes(role)

  // Decide whether to start a tour when the path changes.
  useEffect(() => {
    if (!allowed || typeof window === 'undefined') return
    const off = !!window.localStorage.getItem(offKey(userId))
    const t = off ? null : resolvePageTour(pathname)
    const shouldStart = !!t && !window.localStorage.getItem(seenKey(userId, t.key))
    // Defer all state updates out of the effect body. A short delay also lets
    // the page DOM mount before we anchor the spotlight.
    const id = window.setTimeout(() => {
      if (shouldStart && t) { setI(0); setTour(t) } else setTour(null)
    }, shouldStart ? 650 : 0)
    return () => window.clearTimeout(id)
  }, [pathname, allowed, userId])

  const step = tour?.steps[i] ?? null
  const isLast = !!tour && i >= tour.steps.length - 1

  // Position the spotlight + card for the current step.
  useEffect(() => {
    if (!tour || !step) return
    let raf = 0
    const place = () => {
      if (step.click) {
        const c = document.querySelector<HTMLElement>(step.click)
        c?.click()
      }
      const el = step.selector ? document.querySelector<HTMLElement>(step.selector) : null
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        raf = window.requestAnimationFrame(() => {
          const r = el.getBoundingClientRect()
          setRect(r)
          const ch = cardRef.current?.offsetHeight ?? 200
          const cw = 360
          let left = r.right + 16
          if (left + cw > window.innerWidth - 12) left = Math.max(12, r.left - cw - 16)
          const top = Math.max(12, Math.min(window.innerHeight - ch - 12, r.top))
          setCardPos({ top, left })
        })
      } else {
        setRect(null)
        const ch = cardRef.current?.offsetHeight ?? 200
        setCardPos({ top: Math.max(24, window.innerHeight / 2 - ch / 2), left: Math.max(12, window.innerWidth / 2 - 180) })
      }
    }
    const id = window.setTimeout(place, 140)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.clearTimeout(id); cancelAnimationFrame(raf); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [tour, step, i])

  const finish = useCallback(() => {
    if (tour) window.localStorage.setItem(seenKey(userId, tour.key), '1')
    setTour(null); setRect(null)
  }, [tour, userId])

  const turnOff = useCallback(() => {
    window.localStorage.setItem(offKey(userId), '1')
    if (tour) window.localStorage.setItem(seenKey(userId, tour.key), '1')
    setTour(null); setRect(null)
  }, [tour, userId])

  if (!tour || !step) return null

  return (
    <div className="fixed inset-0 z-[9990] pointer-events-none">
      <div className="absolute inset-0 bg-black/30" />
      {rect && (
        <div
          className="fixed rounded-xl border-2 pointer-events-none transition-all"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8, borderColor: '#ff5900', boxShadow: '0 0 0 4px rgba(250,94,1,0.20), 0 0 0 9999px rgba(0,0,0,0.30)' }}
        />
      )}
      <div
        ref={cardRef}
        className="fixed w-[360px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl pointer-events-auto"
        style={{ top: cardPos.top, left: cardPos.left }}
      >
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#ff5900' }}>
            {tour.label} tour · {i + 1}/{tour.steps.length}
          </p>
          <h3 className="text-sm font-bold text-slate-900 mt-0.5">{step.title}</h3>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm text-slate-600 leading-relaxed">{step.body}</p>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <button onClick={turnOff} className="text-[11px] font-medium text-slate-400 hover:text-slate-600" title="Stop showing tours on every page">
            Don&apos;t show tours
          </button>
          <div className="flex items-center gap-2">
            <button onClick={finish} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Skip</button>
            {i > 0 && (
              <button onClick={() => setI(v => v - 1)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600">Back</button>
            )}
            <button
              onClick={() => (isLast ? finish() : setI(v => v + 1))}
              className="px-3 py-1.5 text-xs rounded-lg text-white font-semibold"
              style={{ background: '#ff5900' }}
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
