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
  // ── Dashboard ─────────────────────────────────────────────────────────────
  {
    title: 'Dashboard',
    description: 'At-a-glance overview of today\'s attendance, pending approvals, active payroll runs, and team activity.',
    href: '/dashboard',
  },

  // ── Employment ────────────────────────────────────────────────────────────
  {
    title: 'All Employees',
    description: 'Master list of every employee — view profiles, employment details, documents, leave balances, and portal access.',
    href: '/employees',
  },
  {
    title: 'Departments',
    description: 'Manage your company\'s department structure. Departments are used across payroll grouping, reports, and employee profiles.',
    href: '/departments',
  },
  {
    title: 'Positions',
    description: 'Define job positions and titles assigned to employees. Appears on payslips, org chart, and reports.',
    href: '/positions',
  },
  {
    title: 'Org Chart',
    description: 'Interactive organization chart showing reporting lines, department hierarchy, and headcount at a glance.',
    href: '/org-chart',
  },
  {
    title: 'Recruitment',
    description: '(Pro) Post job openings with a public application link, track candidates through stages, and convert hires directly into employee records.',
    href: '/recruitment',
  },
  {
    title: 'Onboarding Tracker',
    description: '(Pro) Assign structured onboarding checklists to new hires. Track completion of each step from day one.',
    href: '/onboarding',
  },
  {
    title: 'Performance Reviews',
    description: '(Pro) Create review cycles, set goals and KPIs, collect self-assessments and manager feedback, and record final ratings.',
    href: '/performance-reviews',
  },
  {
    title: 'Offboarding',
    description: '(Pro) Guide employee exits with structured clearance checklists, asset retrieval steps, and offboarding sign-offs.',
    href: '/offboarding',
  },
  {
    title: 'Disciplinary Records',
    description: '(Pro) Log incidents, violations, and disciplinary actions with a permanent record tied to the employee profile.',
    href: '/disciplinary',
  },

  // ── Time & Attendance ─────────────────────────────────────────────────────
  {
    title: 'Weekly Time Sheets',
    description: 'Review, edit, and approve employee DTR records week by week. Each day shows clock-in/out times, tardiness flags, and overtime.',
    href: '/dtr',
  },
  {
    title: 'Live GPS Map',
    description: 'Real-time map showing location pings for every employee currently clocked in via the desktop app or portal.',
    href: '/attendance/map',
  },
  {
    title: 'Tardiness Report',
    description: 'Detailed breakdown of late arrivals, absences, and undertime across any date range. Export-ready for HR reviews.',
    href: '/attendance/tardiness',
  },
  {
    title: 'Overtime Requests',
    description: '(Pro) Employees submit OT requests from the portal. Approve or reject here with automatic payroll inclusion on approval.',
    href: '/overtime',
  },
  {
    title: 'Attendance Settings',
    description: 'Configure geofencing radius, selfie verification on clock-in, screen capture monitoring frequency, and the desktop app download link.',
    href: '/attendance/settings',
  },
  {
    title: 'Work Schedules',
    description: 'Define shift templates (day, night, flexible, compressed) and assign them to employees for accurate DTR and overtime computation.',
    href: '/schedules',
  },
  {
    title: 'Holidays',
    description: 'Maintain the holiday calendar for regular and special non-working days. Automatically applied to payroll and attendance.',
    href: '/holidays',
  },

  // ── Leave Management ──────────────────────────────────────────────────────
  {
    title: 'Leave Requests',
    description: 'View all submitted leave applications. Approve or reject with HR notes, and see running leave balance per employee.',
    href: '/leaves',
  },
  {
    title: 'Leave Types',
    description: 'Create leave categories (SL, VL, Emergency Leave, etc.) with annual entitlements, carry-over rules, and monetization settings.',
    href: '/leaves/types',
  },

  // ── Payroll ───────────────────────────────────────────────────────────────
  {
    title: 'Payroll Runs',
    description: 'Create payroll runs for a cut-off period. Compute earnings and deductions, review each payslip, lock, and release to employees.',
    href: '/payroll',
  },
  {
    title: 'Payroll Settings',
    description: 'Set pay frequency, cut-off dates, SSS/PhilHealth/Pag-IBIG contribution tables, withholding tax method, and de minimis benefits.',
    href: '/payroll/settings',
  },
  {
    title: '13th Month Pay',
    description: 'Compute and review 13th month pay for all active employees based on actual basic salary and days worked for the calendar year.',
    href: '/thirteenth-month',
  },
  {
    title: 'Loans',
    description: 'Record employee loans (SSS, company, Pag-IBIG) and track automatic amortization deductions each payroll cut-off.',
    href: '/loans',
  },

  // ── Announcements ─────────────────────────────────────────────────────────
  {
    title: 'Announcements',
    description: 'Post company-wide announcements that appear on every employee\'s portal dashboard — memos, reminders, and policy updates.',
    href: '/announcements',
  },

  // ── Reports ───────────────────────────────────────────────────────────────
  {
    title: 'SSS R3 Report',
    description: 'Generate the SSS R3 Monthly Contribution Collection List per payroll period for filing and remittance to SSS.',
    href: '/reports/sss',
  },
  {
    title: 'PhilHealth RF-1 Report',
    description: 'Generate PhilHealth RF-1 employer and employee premium contribution reports for monthly remittance.',
    href: '/reports/philhealth',
  },
  {
    title: 'Pag-IBIG MCRF Report',
    description: 'Generate Pag-IBIG Monthly Collection and Remittance Form (MCRF) showing member and employer contributions.',
    href: '/reports/pagibig',
  },
  {
    title: 'BIR Report',
    description: 'Generate BIR-compliant tax reports including the monthly 1601-C and annual alphalist of employees for withholding tax compliance.',
    href: '/reports/bir',
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  {
    title: 'Company Settings',
    description: 'Update company name, address, TIN, logo, and contact details. These appear on payslips, invoices, and statutory reports.',
    href: '/settings',
  },
  {
    title: 'Billing & Plan',
    description: 'View your current subscription, manage seat count, upload proof of payment, and download past invoices.',
    href: '/settings/billing',
  },
  {
    title: 'User Management',
    description: 'Create staff accounts and assign roles: Company Admin, HR Manager, or Payroll Officer. Each role has its own access level.',
    href: '/settings/users',
  },
  {
    title: 'Role Permissions',
    description: 'Fine-tune page-level access for each role — show or hide specific modules per your company\'s workflow.',
    href: '/settings/permissions',
  },
  {
    title: 'Approval Workflows',
    description: 'Configure multi-level approval chains for payroll, leave, and overtime — assign approvers and set escalation rules.',
    href: '/settings/approvals',
  },

  // ── Chat ──────────────────────────────────────────────────────────────────
  {
    title: 'Team Chat',
    description: 'Click the chat bubble at the bottom-right to message employees directly, see who\'s online, and create group channels.',
    clickSelector: '[data-tour="chat-toggle"]',
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
