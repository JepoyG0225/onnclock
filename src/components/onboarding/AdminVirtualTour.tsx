'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { canAccessPath } from '@/lib/auth/page-access'
import { markTourSeen } from '@/lib/onboarding/tour-state'
import type { Permission } from '@/lib/auth/permissions'

type TourStep = {
  title: string
  description: string
  href?: string
  clickSelector?: string
}

const DEFAULT_STEPS: TourStep[] = [
  // Rewritten for the merged navigation. Every href below is a REAL
  // destination, not a legacy redirect - a tour that bounces through
  // redirects flashes the wrong page before landing and looks broken.
  {
    title: 'Welcome to OnClock',
    description: 'This quick tour walks through every section of the sidebar and what each page does. It takes about two minutes - you can skip at any point and restart it later from Settings.',
    href: '/dashboard',
  },
  {
    title: 'Dashboard',
    description: 'Your morning check-in: headcount, the last payroll run, who has clocked in today, pending leave, open tasks, and upcoming statutory deadlines.',
    href: '/dashboard',
  },
  {
    title: 'People - All Employees',
    description: 'The master record for everyone in the company. Open anyone to see personal details, compensation, government IDs, documents, leave balances and portal access.',
    href: '/employees',
  },
  {
    title: 'People - Organization',
    description: 'Departments, Positions and the Org Chart in one place, as three tabs. Departments group people for payroll and reporting; the chart draws reporting lines from each employee\'s Reports To field.',
    href: '/organization',
  },
  {
    title: 'People - Recruitment',
    description: 'The full employee lifecycle as tabs: Hiring (job posts and applicants), Onboarding (new-hire checklists) and Offboarding (exit clearance).',
    href: '/recruitment',
  },
  {
    title: 'People - Performance',
    description: 'Reviews, Disciplinary records and the Tardiness report, tabbed together - everything about how someone is doing, in one place.',
    href: '/performance',
  },
  {
    title: 'People - Assets & Equipment',
    description: 'Track company property issued to staff: laptops, phones, uniforms. Assignments here feed the offboarding clearance checklist.',
    href: '/assets',
  },
  {
    title: 'Time & Attendance - Timesheets',
    description: 'Where attendance is reviewed and approved. Two tabs: Timesheets (daily and weekly hours, late, undertime, overtime) and Corrections (employee-filed fixes for missed punches).',
    href: '/timesheets',
  },
  {
    title: 'Overtime is approved here',
    description: 'Overtime is no longer a separate queue. It is derived from clock data, so when you approve a timesheet you are asked whether to approve its overtime too - and you can pick exactly which overtime rows to include.',
    href: '/timesheets',
  },
  {
    title: 'Time & Attendance - Live GPS Map',
    description: 'See where field staff clocked in from, in real time, when location capture is enabled.',
    href: '/attendance/map',
  },
  {
    title: 'Time & Attendance - Schedules',
    description: 'Work Schedules and the Holiday Calendar as tabs. Schedules drive expected hours (and therefore late and undertime); holidays drive premium pay.',
    href: '/schedules',
  },
  {
    title: 'Time & Attendance - Settings',
    description: 'Clock-in rules: geofencing, selfie capture, screenshots and auto clock-out. It sits last in the group because it configures everything above it.',
    href: '/attendance/settings',
  },
  {
    title: 'Leave Management',
    description: 'Requests come here for approval, the Team Calendar shows who is away, and Leave Types defines your categories and annual entitlements.',
    href: '/leaves',
  },
  {
    title: 'Payroll Runs',
    description: 'Create a run for a cutoff, compute it from approved timesheets, review each payslip, then lock and release. Approved attendance is what payroll reads.',
    href: '/payroll',
  },
  {
    title: 'Payroll - Loans & Cash Advance',
    description: 'Both in one place, as tabs - a cash advance becomes a loan when approved, and both deduct automatically through payslips.',
    href: '/loans',
  },
  {
    title: 'Payroll - Disbursement',
    description: 'Pay everyone out after a run is locked, via InstaPay or PESONet, and track each transfer status.',
    href: '/disbursement',
  },
  {
    title: 'Workspace - Tasks  (NEW)',
    description: 'Brand new: a full task manager built into your HR system. Create tasks with a due date, assignees, notes and file attachments - no project setup required.',
    href: '/tasks',
  },
  {
    title: 'Four ways to see your work',
    description: 'The same tasks, four views: Board (drag between statuses), List (grouped rows), Table (spreadsheet-style) and Calendar (by due date). Switching view never changes which tasks you are looking at - only how they are grouped.',
    href: '/tasks',
  },
  {
    title: 'Tasks are assigned to employees',
    description: 'Because tasks live inside your HR system they are assigned to real employee records - so you can filter to Assigned to me, log hours against a task, and see that time priced against the pay rate on file.',
    href: '/tasks',
  },
  {
    title: 'Make the board yours',
    description: 'Under Statuses and labels you define the columns your team actually uses and mark which one means Done. Anything in a Done status stops counting as overdue and gets a completion date.',
    href: '/tasks',
  },
  {
    title: 'Workspace - Announcements',
    description: 'Post company-wide notices. Employees see them in the portal and get a notification.',
    href: '/announcements',
  },
  {
    title: 'Reports - HR Analytics',
    description: 'Headcount trends, turnover, attendance and payroll cost analysis across your company.',
    href: '/analytics',
  },
  {
    title: 'Reports - Government filings',
    description: 'Ready-to-file SSS R3, PhilHealth RF-1, Pag-IBIG MCRF and BIR forms, generated from your payroll data.',
    href: '/reports/sss',
  },
  {
    title: 'Settings',
    description: 'Company details, users and role permissions, approval workflows, payroll rules and billing. Company details here appear on payslips and statutory reports.',
    href: '/settings',
  },
  {
    title: 'Team Chat',
    description: 'Click the chat bubble at the bottom-right to message employees directly, see who is online, and create group channels.',
    clickSelector: '[data-tour="chat-toggle"]',
  },
]

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
  permissions = [],
}: {
  userId: string
  role: string
  actorRole?: string
  /**
   * Effective Permission[] for this user, resolved server-side in the
   * dashboard layout (honors built-in role override + custom-role
   * assignment). When provided, the tour skips steps that point to pages
   * the user can't actually open — so a Payroll Officer never sees the
   * "All Employees" intro step, an Operations Lead custom role doesn't
   * see "Reports", etc.
   */
  permissions?: Permission[]
}) {
  const pathname = usePathname()
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [cardTop, setCardTop] = useState(24)
  const cardRef = useRef<HTMLDivElement | null>(null)

  const steps = useMemo(() => {
    // Tailor the tour to the user's actual access:
    //   • Keep steps that don't target a route (e.g. the Team Chat step).
    //   • Drop any step whose href the user can't navigate to under the
    //     current permission set. This uses the same canAccessPath() used
    //     by the sidebar filter and the (dashboard) layout route guard,
    //     so the tour stays consistent with what the user actually sees.
    // SUPER_ADMIN gets every Permission via getEffectivePermissions, so
    // they always see the full tour. COMPANY_ADMIN keeps every step
    // because their permission set is force-granted users:manage /
    // settings:write / settings:read at the loader layer.
    return DEFAULT_STEPS.filter((s) => {
      if (!s.href) return true
      return canAccessPath(s.href, permissions)
    })
  }, [permissions])

  useEffect(() => {
    if (!userId) return
    if (actorRole === 'SUPER_ADMIN') return
    if (!['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER'].includes(role)) return

    const progressKey = `onclock_admin_tour_progress_${userId}`

    // Resume mid-tour after a navigation click (location.assign reloads the page).
    let restoreId: number | undefined
    const savedProgressRaw = window.sessionStorage.getItem(progressKey)
    if (savedProgressRaw) {
      try {
        const saved = JSON.parse(savedProgressRaw) as { active?: boolean; stepIndex?: number }
        if (saved.active) {
          const bounded = Math.max(0, Math.min(Number(saved.stepIndex ?? 0), Math.max(steps.length - 1, 0)))
          restoreId = window.setTimeout(() => { setStepIndex(bounded); setActive(true) }, 0)
        }
      } catch { /* ignore corrupted progress */ }
    }

    // The full system tour now starts on explicit request — from the Welcome
    // modal's "Take the full tour" or a Help action — instead of auto-running,
    // so it doesn't collide with the first-login welcome / page tours.
    const onStart = () => {
      setStepIndex(0)
      setActive(true)
      const first = steps[0]
      if (first?.href) clickSidebarHref(first.href)
      else if (first?.clickSelector) clickBySelector(first.clickSelector)
    }
    window.addEventListener('onclock:start-system-tour', onStart)

    return () => {
      if (restoreId) window.clearTimeout(restoreId)
      window.removeEventListener('onclock:start-system-tour', onStart)
    }
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
    // Also record it against the user, so "seen" survives a different device
    // or a cleared browser.
    void markTourSeen('admin-tour')
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
              borderColor: 'var(--brand-highlight)',
              boxShadow: '0 0 0 4px rgba(184, 225, 0,0.2)',
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
              borderLeft: '12px solid var(--brand-highlight)',
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
              style={{ background: 'var(--brand-highlight)' }}
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
