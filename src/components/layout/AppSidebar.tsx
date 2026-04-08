'use client'

import Link from 'next/link'
import Image from 'next/image'
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
  Lock,
  UserCog,
  PanelLeftClose,
  PanelLeftOpen,
  CheckCircle,
  Zap,
  Timer,
  Shield,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PesoIcon } from '@/components/ui/PesoIcon'
import { useSidebar } from './SidebarContext'

const BRAND = '#227f84'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  children?: NavItem[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Employees',
    href: '/employees',
    icon: Users,
    children: [
      { label: 'All Employees', href: '/employees',   icon: Users },
      { label: 'Departments',  href: '/departments', icon: Building2 },
      { label: 'Positions',     href: '/positions',   icon: Briefcase },
      { label: 'Org Chart',     href: '/org-chart', icon: Building2 },
    ],
  },
  {
    label: 'Time & Attendance',
    href: '/dtr',
    icon: Clock,
    children: [
      { label: 'Weekly Time Sheets', href: '/dtr',             icon: Clock },
      { label: 'Live GPS Map',      href: '/attendance/map',  icon: MapPin },
      { label: 'Work Schedules',    href: '/schedules',       icon: Calendar },
      { label: 'Holidays',          href: '/holidays',        icon: CalendarDays },
    ],
  },
  {
    label: 'Leave Management',
    href: '/leaves',
    icon: CalendarDays,
    children: [
      { label: 'Leave Requests', href: '/leaves',            icon: CalendarDays },
      { label: 'Leave Types',    href: '/leaves/types',      icon: FileText },
    ],
  },
  {
    label: 'Payroll',
    href: '/payroll',
    icon: PesoIcon,
    children: [
      { label: 'Payroll Runs',  href: '/payroll',          icon: PesoIcon },
      { label: '13th Month Pay', href: '/thirteenth-month', icon: Gift },
      { label: 'Loans',          href: '/loans',            icon: CreditCard },
    ],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: BarChart3,
    children: [
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
    children: [
      { label: 'Company Settings',    href: '/settings',             icon: Settings },
      { label: 'Billing & Plan',      href: '/settings/billing',     icon: CreditCard },
      { label: 'User Management',     href: '/settings/users',       icon: UserCog },
      { label: 'Role Permissions',    href: '/settings/permissions', icon: Lock },
      { label: 'Approval Workflows',  href: '/settings/approvals',   icon: CheckCircle },
    ],
  },
]

const SYSTEM_ADMIN_NAV_ITEMS: NavItem[] = [
  {
    label: 'Administration',
    href: '/admin',
    icon: Shield,
    children: [
      { label: 'Companies', href: '/admin?tab=companies', icon: Building2 },
      { label: 'Subscriptions', href: '/admin?tab=subscriptions', icon: CreditCard },
      { label: 'Payments', href: '/admin?tab=payments', icon: FileText },
    ],
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')
  const { collapsed, toggle } = useSidebar()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string[]>([
    'Employees', 'Time & Attendance', 'Leave Management', 'Reports', 'Settings',
  ])
  const [counts, setCounts] = useState<{ pendingDtr: number; pendingLeaves: number }>({
    pendingDtr: 0,
    pendingLeaves: 0,
  })
  const [trialEndsAt, setTrialEndsAt] = useState<number | null>(null)
  const [trialTimeLeft, setTrialTimeLeft] = useState<string>('')
  const [trialMsLeft, setTrialMsLeft] = useState(0)

  useEffect(() => {
    let active = true
    async function loadLogo() {
      try {
        const [settingsRes, userRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/users/me'),
        ])
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          if (active) setLogoUrl(settingsData.logoUrl ?? null)
        }
        if (userRes.ok) {
          const userData = await userRes.json()
          if (active) setUserRole(userData.role ?? null)
        }
      } catch { /* ignore */ }
    }
    loadLogo()
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
      try {
        const res = await fetch('/api/sidebar-counts')
        if (!res.ok) return
        const data = await res.json()
        if (active) {
          setCounts({
            pendingDtr: Number(data.pendingDtr) || 0,
            pendingLeaves: Number(data.pendingLeaves) || 0,
          })
        }
      } catch { /* ignore */ }
    }
    loadCounts()
    const id = window.setInterval(loadCounts, 30000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [])

  // Fetch subscription — only care about TRIAL status
  useEffect(() => {
    let active = true
    async function loadSub() {
      try {
        const res = await fetch('/api/billing/subscription')
        if (!res.ok) return
        const data = await res.json()
        if (!active) return
        if (data.subscription?.status === 'TRIAL' && data.subscription?.trialEndsAt) {
          setTrialEndsAt(new Date(data.subscription.trialEndsAt).getTime())
        } else {
          setTrialEndsAt(null)
        }
      } catch { /* ignore */ }
    }
    loadSub()
    const id = window.setInterval(loadSub, 5 * 60 * 1000)
    return () => { active = false; window.clearInterval(id) }
  }, [])

  // Live countdown ticker — updates every second
  useEffect(() => {
    if (trialEndsAt === null) return
    function tick() {
      const diff = trialEndsAt! - Date.now()
      const safeDiff = Math.max(0, diff)
      setTrialMsLeft(safeDiff)
      if (diff <= 0) { setTrialTimeLeft('Expired'); return }
      const totalSec = Math.floor(diff / 1000)
      const days  = Math.floor(totalSec / 86400)
      const hours = Math.floor((totalSec % 86400) / 3600)
      const mins  = Math.floor((totalSec % 3600) / 60)
      const secs  = totalSec % 60
      if (days > 0) {
        setTrialTimeLeft(`${days}d ${String(hours).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m`)
      } else if (hours > 0) {
        setTrialTimeLeft(`${hours}h ${String(mins).padStart(2,'0')}m ${String(secs).padStart(2,'0')}s`)
      } else {
        setTrialTimeLeft(`${String(mins).padStart(2,'0')}m ${String(secs).padStart(2,'0')}s`)
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [trialEndsAt])

  function toggleExpand(label: string) {
    setExpanded(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }

  const isSystemAdmin = userRole === 'SUPER_ADMIN'
  const navItems = isSystemAdmin ? SYSTEM_ADMIN_NAV_ITEMS : NAV_ITEMS
  const trialDaysLeft = Math.max(0, Math.floor(trialMsLeft / 86400000))
  const isTrialUrgent = trialMsLeft < 2 * 86400000
  const trialProgressPct = Math.min(100, Math.max(2, (trialMsLeft / (7 * 86400000)) * 100))

  return (
    <aside
      className="fixed left-0 top-0 h-screen flex flex-col z-20 transition-all duration-300"
      style={{ background: BRAND, width: collapsed ? '4rem' : '16rem' }}
    >
      {/* Logo / Icon */}
      <div
        className="flex items-center justify-center border-b border-white/15 transition-all duration-300 overflow-hidden"
        style={{ height: '4rem', padding: collapsed ? '0 0.75rem' : '0 1.25rem' }}
      >
        {collapsed ? (
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {logoUrl
              ? <img src={logoUrl} alt="Company logo" className="w-full h-full object-contain" />
              : <span className="text-white font-black text-sm">O</span>
            }
          </div>
        ) : (
          <img
            src={logoUrl || '/onclock-logo.png'}
            alt="Company logo"
            className="h-8 w-auto"
            style={{ filter: logoUrl ? undefined : 'brightness(0) invert(1)' }}
          />
        )}
      </div>

      {/* Trial countdown banner */}
      {!isSystemAdmin && trialEndsAt !== null && (
        collapsed ? (
          /* Collapsed: compact icon badge */
          <Tooltip label={`Free trial: ${trialTimeLeft} left`} side="right">
            <Link
              href="/settings/billing"
              className="flex items-center justify-center w-10 h-10 mx-auto rounded-xl relative mt-1 mb-1"
              style={{ background: 'rgba(250,94,1,0.25)' }}
            >
              <Timer className="w-4 h-4 text-orange-300" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-[9px] font-black text-white leading-none">
                {trialDaysLeft}
              </span>
            </Link>
          </Tooltip>
        ) : (
          /* Expanded: full banner */
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
                    background: isTrialUrgent ? 'rgba(239,68,68,0.3)' : 'rgba(250,94,1,0.3)',
                    color: isTrialUrgent ? '#fca5a5' : '#fdba74',
                  }}
                >
                  {trialTimeLeft || '—'}
                </span>
              </div>
              {/* Progress bar — 7 day trial */}
              <div className="h-1 rounded-full mb-2.5" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <div
                  className="h-1 rounded-full transition-all"
                  style={{
                    width: `${trialProgressPct}%`,
                    background: isTrialUrgent
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
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5 no-scrollbar"
        style={{ padding: collapsed ? '0.75rem 0.5rem' : '0.75rem 0.75rem' }}
      >
        {navItems.map(item => (
          <NavItemComponent
            key={item.href}
            item={item}
            pathname={pathname}
            currentTab={currentTab}
            expanded={expanded}
            onToggle={toggleExpand}
            collapsed={collapsed}
            counts={counts}
          />
        ))}
      </nav>

      {/* Collapse toggle button */}
      <div className="border-t border-white/15 p-2 flex items-center" style={{ justifyContent: collapsed ? 'center' : 'flex-end' }}>
        <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right" disabled={!collapsed}>
          <button
            onClick={toggle}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-all"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <PanelLeftOpen  className="w-4 h-4" />
              : <PanelLeftClose className="w-4 h-4" />
            }
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}

// ─── Tooltip wrapper ────────────────────────────────────────────────────────
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

// ─── Collapsed flyout (portal-based to escape overflow clip) ─────────────────
function CollapsedFlyout({
  item, pathname, currentTab, isActive, activeStyle, baseItemClass, counts,
}: {
  item: NavItem
  pathname: string
  currentTab: string | null
  isActive: boolean
  activeStyle: React.CSSProperties
  baseItemClass: string
  counts: { pendingDtr: number; pendingLeaves: number }
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

  function renderBadge(label: string) {
    if (label === 'Weekly Time Sheets' && counts.pendingDtr > 0) {
      return (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5">
          {counts.pendingDtr}
        </span>
      )
    }
    if (label === 'Leave Requests' && counts.pendingLeaves > 0) {
      return (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5">
          {counts.pendingLeaves}
        </span>
      )
    }
    return null
  }

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={baseItemClass} style={isActive ? activeStyle : undefined}>
        <item.icon className="w-4 h-4 flex-shrink-0" />
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ position: 'fixed', top, left: SIDEBAR_W + 8, zIndex: 9999 }}
          className="animate-in fade-in slide-in-from-left-1 duration-100"
        >
          <div className="bg-gray-900 rounded-xl shadow-2xl py-1.5 min-w-[185px] border border-white/10">
            <p className="px-3 py-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider">
              {item.label}
            </p>
            {item.children!.map(child => (
              (() => {
                const [childPath, query] = child.href.split('?')
                const childTab = query ? new URLSearchParams(query).get('tab') : null
                const childActive = childPath === pathname && (childTab ? childTab === currentTab : true)
                return (
              <Link
                key={child.href}
                href={child.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-2 mx-1 rounded-lg text-xs font-medium transition-colors',
                  childActive
                    ? 'text-white'
                    : 'text-white/65 hover:text-white hover:bg-white/10'
                )}
                style={childActive ? { background: 'rgba(250,94,1,0.85)' } : undefined}
              >
                <child.icon className="w-3.5 h-3.5 flex-shrink-0" />
                {child.label}
                {renderBadge(child.label)}
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

// ─── Nav item ───────────────────────────────────────────────────────────────
function NavItemComponent({
  item,
  pathname,
  currentTab,
  expanded,
  onToggle,
  collapsed,
  counts,
}: {
  item: NavItem
  pathname: string
  currentTab: string | null
  expanded: string[]
  onToggle: (label: string) => void
  collapsed: boolean
  counts: { pendingDtr: number; pendingLeaves: number }
}) {
  const isActive   = pathname === item.href || pathname.startsWith(item.href + '/')
  const isExpanded = expanded.includes(item.label)
  const hasChildren = item.children && item.children.length > 0

  const activeStyle   = { background: '#fa5e01' }
  const baseItemClass = cn(
    'flex items-center rounded-xl text-sm font-medium transition-all duration-150 relative',
    isActive ? 'text-white' : 'text-white/70 hover:bg-white/15 hover:text-white',
    collapsed ? 'w-10 h-10 justify-center p-0' : 'px-3 py-2.5 gap-3'
  )

  function renderBadge(label: string) {
    if (label === 'Weekly Time Sheets' && counts.pendingDtr > 0) {
      return (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5">
          {counts.pendingDtr}
        </span>
      )
    }
    if (label === 'Leave Requests' && counts.pendingLeaves > 0) {
      return (
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5">
          {counts.pendingLeaves}
        </span>
      )
    }
    return null
  }

  // ── Collapsed: icon with portal flyout submenu on hover ──
  if (collapsed) {
    if (hasChildren) {
      return (
        <CollapsedFlyout
          item={item}
          pathname={pathname}
          currentTab={currentTab}
          isActive={isActive}
          activeStyle={activeStyle}
          baseItemClass={baseItemClass}
          counts={counts}
        />
      )
    }

    return (
      <Tooltip label={item.label} side="right">
        <Link
          href={item.href}
          className={baseItemClass}
          style={isActive ? activeStyle : undefined}
        >
          <item.icon className="w-4 h-4 flex-shrink-0" />
          {renderBadge(item.label)}
        </Link>
      </Tooltip>
    )
  }

  // ── Expanded: group with collapsible children ──
  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => onToggle(item.label)}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
            isActive ? 'text-white' : 'text-white/70 hover:bg-white/15 hover:text-white'
          )}
          style={isActive ? activeStyle : undefined}
        >
          <span className="flex items-center gap-3">
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {item.label}
          </span>
          {renderBadge(item.label)}
          {isExpanded
            ? <ChevronDown  className="w-3.5 h-3.5 opacity-60" />
            : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          }
        </button>
        {isExpanded && (
          <div className="ml-4 mt-1 mb-1 space-y-0.5 border-l border-white/20 pl-3">
            {item.children!.map(child => (
              (() => {
                const [childPath, query] = child.href.split('?')
                const childTab = query ? new URLSearchParams(query).get('tab') : null
                const childActive = childPath === pathname && (childTab ? childTab === currentTab : true)
                return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150',
                  childActive
                    ? 'text-white'
                    : 'text-white/55 hover:bg-white/15 hover:text-white/90'
                )}
                style={childActive ? { background: 'rgba(250,94,1,0.82)' } : undefined}
              >
                <child.icon className="w-3.5 h-3.5 flex-shrink-0" />
                {child.label}
                {renderBadge(child.label)}
              </Link>
                )
              })()
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Expanded: leaf item ──
  return (
    <Link
      href={item.href}
      className={baseItemClass}
      style={isActive ? activeStyle : undefined}
    >
      <item.icon className="w-4 h-4 flex-shrink-0" />
      {item.label}
      {renderBadge(item.label)}
    </Link>
  )
}
