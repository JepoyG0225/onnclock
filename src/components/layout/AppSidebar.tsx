'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  Clock,
  CalendarDays,
  FileText,
  Settings,
  CreditCard,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Calendar,
  MapPin,
  Gift,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  CheckCircle,
  Shield,
  ClipboardList,
  AlertTriangle,
  Megaphone,
  UserMinus,
  TrendingDown,
  Receipt,
  ClipboardEdit,
  Sparkles,
  Send,
  FolderKanban,
  ClipboardCheck,
  AlarmClock,
  HeartPulse,
  GraduationCap,
} from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { PesoIcon } from '@/components/ui/PesoIcon'
import { useSidebar } from './SidebarContext'
import { isFeatureNew } from '@/components/ui/NewFeatureBadge'
import { canAccessRoute } from '@/lib/auth/permissions'
import { TrialCountdownBanner } from './TrialCountdownBanner'
import { canAccessPath } from '@/lib/auth/page-access'
import type { Permission } from '@/lib/auth/permissions'

const BRAND = '#f7faff'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  children?: NavItem[]
  comingSoon?: boolean
  releasedAt?: string
}

interface SidebarCounts {
  pendingDtr: number
  pendingLeaves: number
  pendingOvertime: number
  pendingTimeCorrections: number
  pendingBudgetRequisitions: number
  pendingCashAdvances: number
}

const EMPTY_SIDEBAR_COUNTS: SidebarCounts = {
  pendingDtr: 0,
  pendingLeaves: 0,
  pendingOvertime: 0,
  pendingTimeCorrections: 0,
  pendingBudgetRequisitions: 0,
  pendingCashAdvances: 0,
}

function pendingCountForItem(item: NavItem, counts: SidebarCounts): number {
  const path = item.href.split('?')[0]
  const countByPath: Record<string, number> = {
    // Timesheets covers both queues it owns. Pending overtime is excluded on
    // purpose: OT is approved as part of its timesheet, so counting it here
    // would double-count the same piece of work.
    '/timesheets': counts.pendingDtr + counts.pendingTimeCorrections,
    '/leaves': counts.pendingLeaves,
    '/budget-requisitions': counts.pendingBudgetRequisitions,
    '/loans': counts.pendingCashAdvances,
  }
  return countByPath[path] ?? 0
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'People',
    href: '/employees',
    icon: Users,
    children: [
      { label: 'All Employees',        href: '/employees',          icon: Users },
      { label: 'Organization',         href: '/organization',       icon: Building2 },
      { label: 'Recruitment',          href: '/recruitment',        icon: ClipboardList },
      { label: 'Performance',          href: '/performance',        icon: BarChart3 },
    ],
  },
  {
    label: 'Time & Attendance',
    href: '/timesheets',
    icon: Clock,
    children: [
      { label: 'Timesheets',               href: '/timesheets',             icon: Clock },
      { label: 'Live GPS Map',             href: '/attendance/map',         icon: MapPin },
      { label: 'Schedules',                href: '/schedules',              icon: Calendar },
      { label: 'Attendance Settings',      href: '/attendance/settings',    icon: Settings },
    ],
  },
  {
    label: 'Leave Management',
    href: '/leaves',
    icon: CalendarDays,
    children: [
      { label: 'Leave Requests',   href: '/leaves',            icon: CalendarDays },
      { label: 'Team Calendar',    href: '/leaves/calendar',   icon: CalendarDays, releasedAt: '2026-05-13T00:00:00+08:00' },
      { label: 'Leave Types',      href: '/leaves/types',      icon: FileText },
    ],
  },
  {
    label: 'Payroll & Finance',
    href: '/payroll',
    icon: PesoIcon,
    children: [
      { label: 'Payroll Runs',  href: '/payroll',          icon: PesoIcon },
      { label: 'Payroll Settings', href: '/payroll/settings', icon: Settings },
      { label: '13th Month Pay', href: '/thirteenth-month', icon: Gift },
      { label: 'Loans & Cash Advance', href: '/loans',      icon: CreditCard },
      { label: 'Budget Requisitions', href: '/budget-requisitions', icon: Receipt },
      { label: 'Expense Claims', href: '/expenses', icon: Receipt, comingSoon: true },
      { label: 'Benefits & HMO', href: '/benefits', icon: HeartPulse, comingSoon: true },
      { label: 'Final Pay',      href: '/final-pay',        icon: Receipt,    releasedAt: '2026-05-13T00:00:00+08:00' },
      { label: 'Disbursement',   href: '/disbursement',     icon: Send,       releasedAt: '2026-05-29T00:00:00+08:00' },
    ],
  },
  {
    label: 'Workspace',
    href: '/tasks',
    icon: ClipboardCheck,
    releasedAt: '2026-08-09T00:00:00+08:00',
    children: [
      { label: 'Tasks',         href: '/tasks',         icon: ClipboardCheck, releasedAt: '2026-08-09T00:00:00+08:00' },
      { label: 'Learning & Certifications', href: '/learning', icon: GraduationCap, comingSoon: true },
      { label: 'Announcements', href: '/announcements', icon: Megaphone },
      { label: 'Assets & Equipment', href: '/assets', icon: Briefcase, releasedAt: '2026-05-13T00:00:00+08:00' },
    ],
  },
  {
    label: 'Reports',
    href: '/analytics',
    icon: BarChart3,
    children: [
      { label: 'HR Analytics',    href: '/analytics',         icon: BarChart3 },
      { label: 'SSS R3',          href: '/reports/sss',       icon: FileText },
      { label: 'PhilHealth RF-1', href: '/reports/philhealth', icon: FileText },
      { label: 'Pag-IBIG MCRF',   href: '/reports/pagibig',   icon: FileText },
      { label: 'BIR',            href: '/reports/bir',       icon: FileText },
    ],
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
  },
]

const SYSTEM_ADMIN_NAV_ITEMS: NavItem[] = [
  {
    label: 'Administration',
    href: '/admin',
    icon: Shield,
    children: [
      { label: 'Companies', href: '/admin/companies', icon: Building2 },
      { label: 'Weekly Time Sheets', href: '/dtr', icon: Clock },
      { label: 'Subscriptions', href: '/admin/subscriptions', icon: CreditCard },
      { label: 'Payments', href: '/admin/payments', icon: FileText },
      { label: 'Payment Methods', href: '/admin/payment-methods', icon: CreditCard },
    ],
  },
]

interface AppSidebarProps {
  initialLogoUrl?: string | null
  initialUserRole?: string | null
  initialCounts?: SidebarCounts
  initialTrialEndsAt?: string | null
  isLocal?: boolean
  hrisProEnabled?: boolean
  disbursementEnabled?: boolean
  /**
   * Effective permissions for the current user (resolved server-side from
   * Role Permissions matrix). When provided, the sidebar hides nav links
   * the user can't access. Empty array = hide everything gated.
   */
  permissions?: Permission[]
}

export function AppSidebar({
  initialLogoUrl = null,
  initialUserRole = null,
  initialCounts = EMPTY_SIDEBAR_COUNTS,
  initialTrialEndsAt = null,
  isLocal = false,
  hrisProEnabled = true,
  disbursementEnabled = false,
  permissions = [],
}: AppSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSidebar()
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [userRole] = useState<string | null>(initialUserRole)
  const [expanded, setExpanded] = useState<string[]>([
    'Employment', 'Time & Attendance', 'Leave Management', 'Reports', 'Settings', 'Payroll & Finance',
  ])
  const [counts, setCounts] = useState<SidebarCounts>(initialCounts)
  // Trial-end timestamp is immutable for the session — keep it as a plain
  // value (no state). The per-second countdown / banner UI lives in
  // <TrialCountdownBanner /> so its 1s ticker doesn't re-render the
  // entire sidebar tree.
  const trialEndsAtMs = initialTrialEndsAt ? new Date(initialTrialEndsAt).getTime() : null

  useEffect(() => {
    let active = true
    function handleLogoUpdate(e: Event) {
      const detail = (e as CustomEvent<{ logoUrl?: string | null }>).detail
      if (active) setLogoUrl(detail?.logoUrl ?? null)
    }
    window.addEventListener('company-logo-updated', handleLogoUpdate as EventListener)
    return () => {
      active = false
      window.removeEventListener('company-logo-updated', handleLogoUpdate as EventListener)
    }
  }, [])

  useEffect(() => {
    let active = true
    async function loadCounts() {
      // Skip polling when the tab is hidden — there's no UI to update
      // and the server-side query is moderately expensive (8+ queries).
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const res = await fetch('/api/sidebar-counts')
        if (!res.ok) return
        const data = await res.json()
        if (active) {
          setCounts({
            pendingDtr: Number(data.pendingDtr) || 0,
            pendingLeaves: Number(data.pendingLeaves) || 0,
            pendingOvertime: Number(data.pendingOvertime) || 0,
            pendingTimeCorrections: Number(data.pendingTimeCorrections) || 0,
            pendingBudgetRequisitions: Number(data.pendingBudgetRequisitions) || 0,
            pendingCashAdvances: Number(data.pendingCashAdvances) || 0,
          })
        }
      } catch { /* ignore */ }
    }
    loadCounts()
    // 120s poll (was 60s). The endpoint also sets Cache-Control:
    // max-age=30, stale-while-revalidate=120 so quick tab-switches inside
    // 30s reuse the cached response and don't hit Prisma at all.
    const id = window.setInterval(loadCounts, 120_000)
    // Refresh when the user comes back to the tab after >1min away so the
    // counts feel current even if the 2-minute poll hasn't fired yet.
    function onVisibility() {
      if (document.visibilityState === 'visible') loadCounts()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  // (Trial countdown ticker moved to <TrialCountdownBanner />.)

  function toggleExpand(label: string) {
    setExpanded(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }

  const isSystemAdmin = userRole === 'SUPER_ADMIN'

  // Apply runtime overrides on top of static NAV_ITEMS:
  // • In local dev, unlock Recruitment comingSoon
  // • When disbursementEnabled=false, mark Disbursement as comingSoon (replaces releasedAt "NEW" badge)
  function applyNavOverrides(items: NavItem[]): NavItem[] {
    return items.map(item => {
      let children = item.children
      if (children) {
        children = children.map(child => {
          if (child.label === 'Recruitment' && isLocal) {
            return { ...child, comingSoon: undefined }
          }
          if (
            isLocal &&
            ['Expense Claims', 'Benefits & HMO', 'Learning & Certifications'].includes(child.label)
          ) {
            return { ...child, comingSoon: undefined }
          }
          if (child.label === 'Disbursement') {
            return disbursementEnabled
              ? { ...child, comingSoon: undefined }
              : { ...child, releasedAt: undefined, comingSoon: true }
          }
          return child
        })
      }
      return { ...item, children }
    })
  }

  // Filter nav items by the user's effective permissions. A parent with
  // children is kept only if at least one child survives the filter. Top-
  // level leaves with no children are kept iff the user can access them.
  // SUPER_ADMIN's `permissions` set already contains every Permission via
  // getEffectivePermissions, so this is a no-op for them.
  function filterByPermissions(items: NavItem[]): NavItem[] {
    return items
      .map(item => {
        if (item.children && item.children.length > 0) {
          const allowedChildren = item.children.filter(c =>
            canAccessPath(c.href, permissions),
          )
          if (allowedChildren.length === 0) return null
          return { ...item, children: allowedChildren }
        }
        return canAccessPath(item.href, permissions) ? item : null
      })
      .filter((item): item is NavItem => item !== null)
  }

  const navItems = isSystemAdmin
    ? SYSTEM_ADMIN_NAV_ITEMS
    : filterByPermissions(applyNavOverrides(NAV_ITEMS))

  // Close mobile sidebar when navigating
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const sidebarContent = (isMobileDrawer: boolean) => {
    const isCollapsedView = isMobileDrawer ? false : collapsed
    return (
      <>
        {/* Logo / Icon */}
        <div
          className="flex items-center border-b border-slate-200 transition-all duration-300 overflow-hidden"
          style={{
            height: '4rem',
            padding: isCollapsedView ? '0 0.75rem' : '0 1.25rem',
            justifyContent: isMobileDrawer ? 'space-between' : 'center',
          }}
        >
          {isCollapsedView ? (
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {logoUrl
                ? <img src={logoUrl} alt="Company logo" className="w-full h-full object-contain" />
                : <span className="text-[var(--brand-primary)] font-black text-sm">O</span>
              }
            </div>
          ) : (
            <img
              src={logoUrl || '/onclock-logo.png'}
              alt="Company logo"
              className="h-8 w-auto"
              style={{ filter: logoUrl ? undefined : undefined }}
            />
          )}
          {isMobileDrawer && (
            <button
              onClick={() => setMobileOpen(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-blue-50 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Trial countdown banner */}
        {!isSystemAdmin && trialEndsAtMs !== null && (
          <TrialCountdownBanner trialEndsAtMs={trialEndsAtMs} collapsed={isCollapsedView} />
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5 sidebar-scroll-minimal"
          style={{ padding: isCollapsedView ? '0.75rem 0.5rem' : '0.75rem 0.75rem' }}
        >
          {navItems.map(item => (
            <NavItemComponent
              key={item.href}
              item={item}
              pathname={pathname}
              currentTab={currentTab}
              expanded={expanded}
              onToggle={toggleExpand}
              collapsed={isCollapsedView}
              counts={counts}
              hrisProEnabled={hrisProEnabled}
            />
          ))}
        </nav>

        {/* Collapse toggle button — hidden on mobile drawer */}
        {!isMobileDrawer && (
          <div className="border-t border-slate-200 p-2 flex items-center" style={{ justifyContent: isCollapsedView ? 'center' : 'flex-end' }}>
            <Tooltip label={isCollapsedView ? 'Expand sidebar' : 'Collapse sidebar'} side="right" disabled={!isCollapsedView}>
              <button
                onClick={toggle}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-blue-50 transition-all"
                title={isCollapsedView ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsedView
                  ? <PanelLeftOpen  className="w-4 h-4" />
                  : <PanelLeftClose className="w-4 h-4" />
                }
              </button>
            </Tooltip>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside
        className="fixed left-0 top-0 h-screen flex-col z-20 border-r border-slate-200 shadow-sm transition-all duration-300 hidden md:flex"
        style={{ background: BRAND, width: collapsed ? '4rem' : '16rem' }}
      >
        {sidebarContent(false)}
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" />
          {/* Drawer */}
          <aside
            className="absolute left-0 top-0 h-full w-72 flex flex-col border-r border-slate-200 shadow-2xl animate-in slide-in-from-left duration-200"
            style={{ background: BRAND }}
            onClick={e => e.stopPropagation()}
          >
            {sidebarContent(true)}
          </aside>
        </div>
      )}
    </>
  )
}

// â"€â"€â"€ Tooltip wrapper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function Tooltip({
  label,
  children,
  side = 'right',
  disabled = false,
}: {
  label: string
  children: React.ReactNode
  side?: 'right' | 'top'
  disabled?: boolean
}) {
  if (disabled) return <>{children}</>
  return (
    <div className="relative group">
      {children}
      <div
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-lg px-2.5 py-1.5',
          'bg-gray-900 text-white text-xs font-medium shadow-xl',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          side === 'right'
            ? 'left-full ml-3 top-1/2 -translate-y-1/2'
            : 'bottom-full mb-2 left-1/2 -translate-x-1/2'
        )}
      >
        {label}
        {/* Arrow */}
        {side === 'right' && (
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        )}
      </div>
    </div>
  )
}

// â"€â"€â"€ Collapsed flyout (portal-based to escape overflow clip) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const PRO_LABELS = new Set([
  'Performance Reviews',
  'Overtime Requests',
  'Offboarding',
  'Disciplinary Records',
  'Recruitment',
  'Onboarding Tracker',
  'Budget Requisitions',
  // Phase 1 HRIS expansion (May 2026)
  'HR Analytics',
  'Team Calendar',
  'Assets & Equipment',
  // Phase 2 (May 2026)
  'Disbursement',
])

function CollapsedFlyout({
  item, pathname, currentTab, isActive, activeStyle, baseItemClass, counts, hrisProEnabled,
}: {
  item: NavItem
  pathname: string
  currentTab: string | null
  isActive: boolean
  activeStyle: React.CSSProperties
  baseItemClass: string
  counts: SidebarCounts
  hrisProEnabled: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [top,  setTop]  = useState(0)
  const closeTimer = useRef<number | null>(null)

  function handleMouseEnter() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setTop(rect.top)
    }
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(true)
  }
  function handleMouseLeave() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 120)
  }

  const SIDEBAR_W = 64 // 4rem = 64px

  function renderBadge(child: NavItem) {
    if (child.comingSoon) {
      return (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-sky-500/80 text-white text-[9px] font-black px-1.5 py-0.5 tracking-wide">
          Soon
        </span>
      )
    }
    if (PRO_LABELS.has(child.label) && !hrisProEnabled) {
      return (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-[9px] font-black px-1.5 py-0.5 tracking-wide">
          🔒
        </span>
      )
    }
    const pendingCount = pendingCountForItem(child, counts)
    if (pendingCount > 0) {
      return (
        <span className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-highlight)] px-1.5 py-0.5 text-[10px] font-black text-black shadow-sm">
          {pendingCount}
        </span>
      )
    }
    if (child.releasedAt && isFeatureNew(child.releasedAt)) {
      return (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-[var(--brand-highlight)] text-black text-[9px] font-black px-1.5 py-0.5 tracking-wide">
          NEW
        </span>
      )
    }
    return null
  }

  function isProLocked(child: NavItem) {
    return PRO_LABELS.has(child.label) && !hrisProEnabled
  }

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={cn(baseItemClass, item.comingSoon && 'opacity-50 cursor-not-allowed')}
        style={isActive ? activeStyle : undefined}
        data-tour-item={item.href}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ position: 'fixed', top, left: SIDEBAR_W + 8, zIndex: 9999 }}
          className="animate-in fade-in slide-in-from-left-1 duration-100"
        >
          <div className="rounded-xl border border-slate-200 bg-white py-1.5 shadow-2xl min-w-[185px]">
            <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {item.label}
            </p>
            {item.children!.map(child => (
              (() => {
                const [childPath, query] = child.href.split('?')
                const childTab = query ? new URLSearchParams(query).get('tab') : null
                const childActive = childPath === pathname && (childTab ? childTab === currentTab : true)
                if (child.comingSoon) {
                  return (
                    <div
                      key={child.href}
                      className="flex items-center gap-2.5 px-2 py-2 mx-1 rounded-lg text-xs font-medium text-slate-400 cursor-not-allowed whitespace-nowrap"
                    >
                      <child.icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{child.label}</span>
                      {renderBadge(child)}
                    </div>
                  )
                }
                return (
              <Link
                key={child.href}
                href={child.href}
                data-tour-item={child.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-2 mx-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                  childActive
                    ? 'text-white'
                    : 'text-slate-600 hover:bg-blue-50 hover:text-[var(--brand-primary)]'
                )}
                style={childActive ? activeStyle : undefined}
              >
                <child.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{child.label}</span>
                {renderBadge(child)}
              </Link>
                )
              })()
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// â"€â"€â"€ Nav item â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function NavItemComponent({
  item,
  pathname,
  currentTab,
  expanded,
  onToggle,
  collapsed,
  counts,
  hrisProEnabled,
}: {
  item: NavItem
  pathname: string
  currentTab: string | null
  expanded: string[]
  onToggle: (label: string) => void
  collapsed: boolean
  counts: SidebarCounts
  hrisProEnabled: boolean
}) {
  const isActive   = pathname === item.href || pathname.startsWith(item.href + '/')
  const isExpanded = expanded.includes(item.label)
  const hasChildren = item.children && item.children.length > 0

  const activeStyle   = {
    background: 'var(--brand-primary)',
    color: '#ffffff',
    boxShadow: '0 4px 12px rgba(11, 111, 251, 0.18)',
  }
  const baseItemClass = cn(
    'flex items-center rounded-xl text-sm font-medium transition-all duration-150 relative',
    isActive ? 'text-white' : 'text-slate-600 hover:bg-blue-50 hover:text-[var(--brand-primary)]',
    collapsed ? 'w-10 h-10 justify-center p-0' : 'px-3 py-2.5 gap-3'
  )

  function renderBadge(child: NavItem) {
    if (child.comingSoon) {
      return (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-sky-500/80 text-white text-[9px] font-black px-1.5 py-0.5 tracking-wide">
          Soon
        </span>
      )
    }
    if (PRO_LABELS.has(child.label) && !hrisProEnabled) {
      return (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-[9px] font-black px-1.5 py-0.5 tracking-wide">
          🔒
        </span>
      )
    }
    const pendingCount = pendingCountForItem(child, counts)
    if (pendingCount > 0) {
      return (
        <span className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-highlight)] px-1.5 py-0.5 text-[10px] font-black text-black shadow-sm">
          {pendingCount}
        </span>
      )
    }
    if (child.releasedAt && isFeatureNew(child.releasedAt)) {
      return (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-[var(--brand-highlight)] text-black text-[9px] font-black px-1.5 py-0.5 tracking-wide">
          NEW
        </span>
      )
    }
    return null
  }

  function isProLocked(child: NavItem) {
    return PRO_LABELS.has(child.label) && !hrisProEnabled
  }

  // â"€â"€ Collapsed: icon with portal flyout submenu on hover â"€â"€
  if (collapsed) {
    if (hasChildren) {
      if (item.comingSoon) {
        return (
          <Tooltip label={`${item.label} — Coming Soon`} side="right">
            <div className={cn(baseItemClass, 'opacity-40 cursor-not-allowed')}>
              <item.icon className="w-4 h-4 flex-shrink-0" />
            </div>
          </Tooltip>
        )
      }
      return (
        <CollapsedFlyout
          item={item}
          pathname={pathname}
          currentTab={currentTab}
          isActive={isActive}
          activeStyle={activeStyle}
          baseItemClass={baseItemClass}
          counts={counts}
          hrisProEnabled={hrisProEnabled}
        />
      )
    }

    if (item.comingSoon) {
      return (
        <Tooltip label={`${item.label} — Coming Soon`} side="right">
          <div className={cn(baseItemClass, 'opacity-40 cursor-not-allowed')}>
            <item.icon className="w-4 h-4 flex-shrink-0" />
          </div>
        </Tooltip>
      )
    }
    return (
      <Tooltip label={item.label} side="right">
        <Link
          href={item.href}
          data-tour-item={item.href}
          className={baseItemClass}
          style={isActive ? activeStyle : undefined}
        >
          <item.icon className="w-4 h-4 flex-shrink-0" />
          {renderBadge(item)}
        </Link>
      </Tooltip>
    )
  }

  // â"€â"€ Expanded: group with collapsible children â"€â"€
  if (hasChildren) {
    return (
      <div className={item.comingSoon ? 'opacity-50' : undefined}>
        <button
          onClick={() => !item.comingSoon && onToggle(item.label)}
          data-tour-item={item.href}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
            isActive ? 'text-white' : 'text-slate-600 hover:bg-blue-50 hover:text-[var(--brand-primary)]',
            item.comingSoon && 'cursor-not-allowed pointer-events-none'
          )}
          style={isActive ? activeStyle : undefined}
        >
          <span className="flex items-center gap-3">
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {item.label}
            {/* Groups can be new too. The badge only rendered for leaf items
                before, so a newly-added GROUP (like Workspace) was silently
                unmarked — the one case where "new" matters most, because the
                whole section is unfamiliar. Also lights up when a child is
                new but the group is collapsed, so the badge isn't hidden
                behind a chevron. */}
            {!item.comingSoon && (
              (item.releasedAt && isFeatureNew(item.releasedAt)) ||
              (!isExpanded && item.children?.some(c => c.releasedAt && isFeatureNew(c.releasedAt)))
            ) && (
              <span className="inline-flex items-center justify-center rounded-full bg-fuchsia-500 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-white">
                NEW
              </span>
            )}
          </span>
          {!item.comingSoon && (isExpanded
            ? <ChevronDown  className="w-3.5 h-3.5 opacity-60" />
            : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          )}
        </button>
        {isExpanded && !item.comingSoon && (
          <div className="ml-4 mt-1 mb-1 space-y-0.5 border-l border-slate-200 pl-3">
            {item.children!.map(child => (
              (() => {
                const [childPath, query] = child.href.split('?')
                const childTab = query ? new URLSearchParams(query).get('tab') : null
                const childActive = childPath === pathname && (childTab ? childTab === currentTab : true)
                if (child.comingSoon) {
                  return (
                    <div
                      key={child.href}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 cursor-not-allowed whitespace-nowrap"
                    >
                      <child.icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{child.label}</span>
                      {renderBadge(child)}
                    </div>
                  )
                }
                return (
              <Link
                key={child.href}
                href={child.href}
                data-tour-item={child.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap',
                  childActive
                    ? 'text-white'
                    : 'text-slate-500 hover:bg-blue-50 hover:text-[var(--brand-primary)]'
                )}
                style={childActive ? activeStyle : undefined}
              >
                <child.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{child.label}</span>
                {renderBadge(child)}
              </Link>
                )
              })()
            ))}
          </div>
        )}
      </div>
    )
  }

  // â"€â"€ Expanded: leaf item â"€â"€
  if (item.comingSoon) {
    return (
      <div
        className={cn(baseItemClass, 'opacity-50 cursor-not-allowed pointer-events-none')}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        {item.label}
        {renderBadge(item)}
      </div>
    )
  }
  return (
    <Link
      href={item.href}
      data-tour-item={item.href}
      className={baseItemClass}
      style={isActive ? activeStyle : undefined}
    >
      <item.icon className="w-4 h-4 flex-shrink-0" />
      {item.label}
      {renderBadge(item)}
    </Link>
  )
}
