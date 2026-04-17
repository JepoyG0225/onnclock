'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

type TourStep = {
  title: string
  description: string
  href?: string
  clickSelector?: string
}

const DEFAULT_STEPS: TourStep[] = [
  {
    title: 'Dashboard',
    description: 'Overview of attendance, payroll, and pending actions for your company.',
    href: '/dashboard',
  },
  {
    title: 'All Employees',
    description: 'Master list of all employee records and their current status.',
    href: '/employees',
  },
  {
    title: 'Departments',
    description: 'Manage company department structure used across employee and reporting modules.',
    href: '/departments',
  },
  {
    title: 'Positions',
    description: 'Define job positions and titles used in employee profiles.',
    href: '/positions',
  },
  {
    title: 'Org Chart',
    description: 'Visual organization hierarchy to review reporting lines.',
    href: '/org-chart',
  },
  {
    title: 'Weekly Time Sheets',
    description: 'Review and approve employee DTR and attendance records.',
    href: '/dtr',
  },
  {
    title: 'Live GPS Map',
    description: 'Live view of location pings for employees currently clocked in.',
    href: '/attendance/map',
  },
  {
    title: 'Work Schedules',
    description: 'Configure shift schedules and workday setups.',
    href: '/schedules',
  },
  {
    title: 'Holidays',
    description: 'Manage holiday calendar used for payroll and attendance computations.',
    href: '/holidays',
  },
  {
    title: 'Leave Requests',
    description: 'Approve, reject, and monitor employee leave applications.',
    href: '/leaves',
  },
  {
    title: 'Leave Types',
    description: 'Set leave entitlements, policies, and leave categories.',
    href: '/leaves/types',
  },
  {
    title: 'Payroll Runs',
    description: 'Create and manage payroll runs before lock and release.',
    href: '/payroll',
  },
  {
    title: '13th Month Pay',
    description: 'Review and generate 13th month computation and logs.',
    href: '/thirteenth-month',
  },
  {
    title: 'Loans',
    description: 'Track employee loan balances and payroll deductions.',
    href: '/loans',
  },
  {
    title: 'Reports',
    description: 'Generate statutory and payroll reports (SSS, PhilHealth, Pag-IBIG, BIR).',
    href: '/reports',
  },
  {
    title: 'Company Settings',
    description: 'Update company profile and key system configuration.',
    href: '/settings',
  },
  {
    title: 'Billing & Plan',
    description: 'Manage subscription, invoices, and plan-related billing details.',
    href: '/settings/billing',
  },
  {
    title: 'User Management',
    description: 'Create and manage internal user accounts for admin and staff access.',
    href: '/settings/users',
  },
  {
    title: 'Role Permissions',
    description: 'Control page-level access by role inside your company account.',
    href: '/settings/permissions',
  },
  {
    title: 'Approval Workflows',
    description: 'Configure approval routing for payroll and leave processes.',
    href: '/settings/approvals',
  },
  {
    title: 'Team Chat',
    description: 'Use the floating chat icon to message online employees and monitor online/offline status.',
    clickSelector: '[data-tour=\"chat-toggle\"]',
  },
]

const RESTRICTED_FOR_NON_COMPANY_ADMIN = new Set([
  '/settings/billing',
  '/settings/users',
  '/settings/permissions',
  '/settings/approvals',
])

function clickSidebarHref(href: string): boolean {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-tour-item]'))
  const target = nodes.find((el) => el.dataset.tourItem === href)
  if (!target) return false
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  target.click()
  return true
}

function clickBySelector(selector: string): boolean {
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.click()
  return true
}

export function AdminVirtualTour({
  userId,
  role,
  actorRole,
}: {
  userId: string
  role: string
  actorRole?: string
}) {
  const pathname = usePathname()
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [cardTop, setCardTop] = useState(24)
  const cardRef = useRef<HTMLDivElement | null>(null)

  const steps = useMemo(() => {
    if (role !== 'COMPANY_ADMIN') {
      return DEFAULT_STEPS.filter((s) => !s.href || !RESTRICTED_FOR_NON_COMPANY_ADMIN.has(s.href))
    }
    return DEFAULT_STEPS
  }, [role])

  useEffect(() => {
    if (!userId) return
    if (actorRole === 'SUPER_ADMIN') return
    if (!['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(role)) return

    const seenKey = `onclock_admin_tour_seen_${userId}`
    const progressKey = `onclock_admin_tour_progress_${userId}`
    const seen = window.localStorage.getItem(seenKey)
    if (seen) return

    const savedProgressRaw = window.sessionStorage.getItem(progressKey)
    if (savedProgressRaw) {
      try {
        const saved = JSON.parse(savedProgressRaw) as { active?: boolean; stepIndex?: number }
        if (saved.active) {
          const bounded = Math.max(0, Math.min(Number(saved.stepIndex ?? 0), Math.max(steps.length - 1, 0)))
          const restoreId = window.setTimeout(() => {
            setStepIndex(bounded)
            setActive(true)
          }, 0)
          return () => window.clearTimeout(restoreId)
        }
      } catch {
        // ignore corrupted progress and fall through to fresh start
      }
    }

    const id = window.setTimeout(() => {
      setActive(true)
      const first = steps[0]
      if (first?.href) clickSidebarHref(first.href)
      if (first?.clickSelector) clickBySelector(first.clickSelector)
    }, 700)

    return () => window.clearTimeout(id)
  }, [userId, role, actorRole, steps])

  useEffect(() => {
    if (!userId) return
    const progressKey = `onclock_admin_tour_progress_${userId}`
    if (!active) {
      window.sessionStorage.removeItem(progressKey)
      return
    }
    window.sessionStorage.setItem(
      progressKey,
      JSON.stringify({ active: true, stepIndex })
    )
  }, [active, stepIndex, userId])

  const step = steps[stepIndex] ?? null
  const isLast = stepIndex >= steps.length - 1
  const seenKey = `onclock_admin_tour_seen_${userId}`
  const progressKey = `onclock_admin_tour_progress_${userId}`

  const findStepTarget = (targetStep: TourStep): HTMLElement | null => {
    if (targetStep.href) {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-tour-item]'))
      return nodes.find((el) => el.dataset.tourItem === targetStep.href) ?? null
    }
    if (targetStep.clickSelector) return document.querySelector(targetStep.clickSelector) as HTMLElement | null
    return null
  }

  useEffect(() => {
    if (!active || !step) return

    const updatePositions = () => {
      const target = findStepTarget(step)
      if (!target) {
        setTargetRect(null)
        return
      }
      const rect = target.getBoundingClientRect()
      setTargetRect(rect)
      const cardHeight = cardRef.current?.offsetHeight ?? 260
      const top = rect.top + rect.height / 2 - cardHeight / 2
      const clampedTop = Math.max(12, Math.min(window.innerHeight - cardHeight - 12, top))
      setCardTop(clampedTop)
    }

    const id = window.setTimeout(updatePositions, 120)
    window.addEventListener('resize', updatePositions)
    window.addEventListener('scroll', updatePositions, true)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('resize', updatePositions)
      window.removeEventListener('scroll', updatePositions, true)
    }
  }, [active, step, pathname])

  function completeTour() {
    window.localStorage.setItem(seenKey, '1')
    window.sessionStorage.removeItem(progressKey)
    setActive(false)
  }

  function skipTour() {
    completeTour()
  }

  function goNext() {
    if (!step) return
    if (isLast) {
      completeTour()
      return
    }

    const nextIndex = stepIndex + 1
    const next = steps[nextIndex]
    setStepIndex(nextIndex)

    if (next.href) {
      const clicked = clickSidebarHref(next.href)
      if (!clicked) window.location.assign(next.href)
    } else if (next.clickSelector) {
      clickBySelector(next.clickSelector)
    }
  }

  function goPrev() {
    if (!step) return
    if (stepIndex === 0) return
    const prevIndex = stepIndex - 1
    const prev = steps[prevIndex]
    setStepIndex(prevIndex)
    if (prev.href) {
      const clicked = clickSidebarHref(prev.href)
      if (!clicked) window.location.assign(prev.href)
    } else if (prev.clickSelector) {
      clickBySelector(prev.clickSelector)
    }
  }

  if (!active || !step || steps.length === 0) return null

  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      <div className="absolute inset-0 bg-black/25" />
      {targetRect && step.href && (
        <>
          <div
            className="fixed z-[9999] pointer-events-none rounded-xl border-2"
            style={{
              left: targetRect.left - 2,
              top: targetRect.top - 2,
              width: targetRect.width + 4,
              height: targetRect.height + 4,
              borderColor: '#fa5e01',
              boxShadow: '0 0 0 4px rgba(250,94,1,0.2)',
            }}
          />
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{
              left: targetRect.right + 6,
              top: targetRect.top + targetRect.height / 2 - 8,
              width: 0,
              height: 0,
              borderTop: '8px solid transparent',
              borderBottom: '8px solid transparent',
              borderLeft: '12px solid #fa5e01',
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))',
            }}
          />
        </>
      )}

      <div
        ref={cardRef}
        className="fixed w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl pointer-events-auto"
        style={
          targetRect
            ? { top: `${cardTop}px`, left: '272px' }
            : { top: '24px', left: '272px' }
        }
      >
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            System Tour {stepIndex + 1}/{steps.length}
          </p>
          <h3 className="text-sm font-bold text-slate-900 mt-0.5">{step.title}</h3>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
          <p className="text-[11px] text-slate-400 mt-2">
            Tour performs real navigation clicks so you can see each module in context.
          </p>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={skipTour}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={stepIndex === 0}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              className="px-3 py-1.5 text-xs rounded-lg text-white"
              style={{ background: '#fa5e01' }}
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
